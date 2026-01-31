const router = require("express").Router();
const Match = require("../models/Match");
const User = require("../models/User");
const axios = require("axios");
const auth = require("../middleware/authMiddleware");

// 1. Send Payment Reminder (Email with QR)
router.post("/remind", auth, async (req, res) => {
  try {
    const { matchId, playerId } = req.body;

    // Fetch Match & Organizer
    const match = await Match.findById(matchId);
    const organizer = await User.findById(req.user.user.id);

    if (!match) return res.status(404).json({ message: "Match not found" });
    if (match.createdBy !== req.user.user.id)
      return res.status(403).json({ message: "Unauthorized" });

    // Find Player details
    const playerDef = match.players.id(playerId);

    let targetEmail = "";
    let targetName = playerDef.name;

    if (playerDef.isGuest) {
      // If guest, use the email stored directly on the player object
      targetEmail = playerDef.email;
      if (!targetEmail)
        return res.status(400).json({ message: "Guest player has no email" });
    } else {
      // If registered user, look up their account
      const playerUser = await User.findById(playerDef.userId);
      if (!playerUser)
        return res.status(404).json({ message: "User not found" });
      targetEmail = playerUser.email;
    }

    // In a real app, we would look up the player's User object to get their email.
    // For now, assuming we stored email or finding user by ID:
    const playerUser = await User.findById(playerDef.userId);

    if (!playerUser)
      return res.status(404).json({ message: "Player user not found" });

    // Calculate Amount
    const totalCost = match.costPerHour * match.durationHours;
    const amountPerHead = Math.ceil(totalCost / match.players.length);

    // UPI Logic (From your Money Manager)
    const payeeVPA = organizer.upiId || "yashwantnagarkar@ibl"; // Fallback to yours if not set
    const payeeName = encodeURIComponent(organizer.name);
    const note = encodeURIComponent(`TurfWar: ${match.title}`);

    const upiLink = `upi://pay?pa=${payeeVPA}&pn=${payeeName}&am=${amountPerHead}&tn=${note}`;
    const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
      upiLink
    )}`;

    // Email Logic (From your email.js)
    const htmlContent = `
  <div style="
    font-family: 'Segoe UI', Arial, sans-serif;
    background-color: #0b0f14;
    color: #e5e7eb;
    max-width: 600px;
    margin: auto;
    padding: 24px;
    border-radius: 12px;
  ">

    <!-- Card -->
    <div style="
      background-color: #111827;
      border: 1px solid #1f2937;
      border-radius: 14px;
      padding: 24px;
    ">

      <!-- Header -->
      <div style="text-align: center; margin-bottom: 24px;">
        <h2 style="
          color: #10b981;
          margin: 0;
          font-size: 24px;
          font-weight: 700;
        ">
          TurfWar Payment
        </h2>
        <p style="
          color: #9ca3af;
          margin: 6px 0 0;
          font-size: 14px;
        ">
          Match: ${match.title}
        </p>
      </div>

      <!-- Body -->
      <p style="font-size: 15px; line-height: 1.6; margin: 0 0 12px;">
        Hi <strong style="color:#ffffff;">${playerUser.name}</strong>,
      </p>

      <p style="font-size: 15px; line-height: 1.6; margin: 0 0 20px; color: #d1d5db;">
        You have been requested to pay your share for the upcoming match.
      </p>

      <!-- Amount -->
      <div style="
        background-color: #0f172a;
        border: 1px solid #1f2937;
        padding: 18px;
        border-radius: 12px;
        text-align: center;
        margin: 24px 0;
      ">
        <p style="
          font-size: 13px;
          color: #9ca3af;
          margin: 0;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        ">
          Amount Due
        </p>
        <p style="
          font-size: 36px;
          font-weight: 800;
          color: #10b981;
          margin: 6px 0 0;
        ">
          ₹${amountPerHead}
        </p>
      </div>

      <!-- QR -->
      <div style="text-align: center; margin: 28px 0;">
        <img
          src="${qrImageUrl}"
          alt="Payment QR"
          style="
            background-color: #ffffff;
            border-radius: 12px;
            padding: 12px;
            max-width: 240px;
            display: block;
            margin: auto;
          "
        />
        <p style="
          font-size: 12px;
          color: #9ca3af;
          margin-top: 10px;
        ">
          Scan with GPay, PhonePe, Paytm
        </p>
      </div>

      <!-- Footer -->
      <p style="
        font-size: 13px;
        text-align: center;
        color: #9ca3af;
        margin: 0;
      ">
        Organizer: 
        <span style="color:#e5e7eb; font-weight: 600;">
          ${organizer.name}
        </span>
        <br />
        <span style="font-size: 12px; color: #6b7280;">
          ${payeeVPA}
        </span>
      </p>

    </div>

    <!-- App Footer -->
    <p style="
      text-align: center;
      font-size: 11px;
      color: #6b7280;
      margin-top: 16px;
    ">
      TurfWar • Play fair. Pay fair.
    </p>
  </div>
`;

    // Send via Brevo (Using env vars)
    await axios.post(
      "https://api.brevo.com/v3/smtp/email",
      {
        sender: { name: "TurfWar", email: "yashwantnagarkar04@gmail.com" }, // Use your verified email
        to: [{ email: playerUser.email }],
        subject: `Payment Request: ₹${amountPerHead} for ${match.title}`,
        htmlContent,
      },
      {
        headers: {
          accept: "application/json",
          "api-key": process.env.BREVO_API_KEY, // Ensure this is in your .env
          "content-type": "application/json",
        },
      }
    );

    res.json({ message: "Reminder sent successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to send reminder" });
  }
});

// 2. Set Organizer UPI ID
router.put("/upi", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.user.id);
    user.upiId = req.body.upiId;
    await user.save();
    res.json({ message: "UPI ID Updated", user });
  } catch (err) {
    res.status(500).json({ message: "Error updating UPI" });
  }
});

module.exports = router;
