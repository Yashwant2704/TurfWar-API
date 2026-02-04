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
    
    // --- UPDATED USER LOOKUP LOGIC ---
    let targetEmail = "";
    let targetName = playerDef.name;
    
    if (playerDef.isGuest) {
      targetEmail = playerDef.email;
      if (!targetEmail) return res.status(400).json({ message: "Guest player has no email" });
    } else {
      const playerUser = await User.findById(playerDef.userId);
      if (!playerUser) return res.status(404).json({ message: "User not found" });
      targetEmail = playerUser.email;
      targetName = playerUser.name; // Ensure we have the registered name
    }

    // Calculate Amount
    const totalCost = match.costPerHour * match.durationHours;
    const amountPerHead = Math.ceil(totalCost / match.players.length);

    // UPI Logic
    const payeeVPA = organizer.upiId || "yashwantnagarkar@ibl"; 
    const payeeName = encodeURIComponent(organizer.name);
    const note = encodeURIComponent(`TurfWar: ${match.title}`);

    // 1. RAW UPI LINK (For QR)
    const upiLink = `upi://pay?pa=${payeeVPA}&pn=${payeeName}&am=${amountPerHead}&tn=${note}`;
    
    // 2. QR CODE URL
    const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(upiLink)}`;

    // 3. NEW: HTTP REDIRECT LINK (For Clickable Button)
    // This constructs a link like: http://localhost:5000/api/pay-redirect?pa=...
    const protocol = req.protocol;
    const host = req.get('host'); 
    const baseUrl = process.env.BASE_URL || `${protocol}://${host}/api`; // Adjust '/api' based on your routing
    const paymentRedirectUrl = `${baseUrl}/finance/pay-redirect?pa=${payeeVPA}&pn=${payeeName}&am=${amountPerHead}&tn=${note}`;

    // Email Logic
    const htmlContent = `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; background-color: #0b0f14; color: #e5e7eb; max-width: 600px; margin: auto; padding: 24px; border-radius: 12px;">
        
        <div style="background-color: #111827; border: 1px solid #1f2937; border-radius: 14px; padding: 24px;">
          
          <div style="text-align: center; margin-bottom: 24px;">
            <h2 style="color: #10b981; margin: 0; font-size: 24px; font-weight: 700;">TurfWar Payment</h2>
            <p style="color: #9ca3af; margin: 6px 0 0; font-size: 14px;">Match: ${match.title}</p>
          </div>

          <p style="font-size: 15px; line-height: 1.6; margin: 0 0 12px;">Hi <strong style="color:#ffffff;">${targetName}</strong>,</p>
          <p style="font-size: 15px; line-height: 1.6; margin: 0 0 20px; color: #d1d5db;">You have been requested to pay your share for the upcoming match.</p>

          <div style="background-color: #0f172a; border: 1px solid #1f2937; padding: 18px; border-radius: 12px; text-align: center; margin: 24px 0;">
            <p style="font-size: 13px; color: #9ca3af; margin: 0; letter-spacing: 0.04em; text-transform: uppercase;">Amount Due</p>
            <p style="font-size: 36px; font-weight: 800; color: #10b981; margin: 6px 0 0;">₹${amountPerHead}</p>
          </div>

          <div style="text-align: center; margin-bottom: 24px;">
            <a href="${paymentRedirectUrl}" style="background-color: #10b981; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 50px; font-weight: bold; font-size: 16px; display: inline-block; box-shadow: 0 4px 6px rgba(16, 185, 129, 0.3);">
              Pay Now via UPI
            </a>
            <p style="font-size: 12px; color: #6b7280; margin-top: 12px;">Works with GPay, PhonePe, Paytm</p>
          </div>

          <div style="text-align: center; margin: 20px 0; position: relative;">
            <span style="background-color: #111827; padding: 0 10px; color: #6b7280; font-size: 12px; position: relative; z-index: 1;">OR SCAN QR</span>
            <div style="border-top: 1px solid #1f2937; position: absolute; top: 50%; left: 0; right: 0; z-index: 0;"></div>
          </div>

          <div style="text-align: center; margin-bottom: 20px;">
            <img src="${qrImageUrl}" alt="Payment QR" style="background-color: #ffffff; border-radius: 12px; padding: 12px; max-width: 180px; display: block; margin: auto;" />
          </div>

          <p style="font-size: 13px; text-align: center; color: #9ca3af; margin: 0;">
            Organizer: <span style="color:#e5e7eb; font-weight: 600;">${organizer.name}</span><br />
            <span style="font-size: 12px; color: #6b7280;">${payeeVPA}</span>
          </p>
        </div>

        <p style="text-align: center; font-size: 11px; color: #6b7280; margin-top: 16px;">TurfWar • Play fair. Pay fair.</p>
      </div>
    `;

    // Send via Brevo
    await axios.post(
      "https://api.brevo.com/v3/smtp/email",
      {
        sender: { name: "TurfWar", email: "yashwantnagarkar04@gmail.com" },
        to: [{ email: targetEmail }],
        subject: `Payment Request: ₹${amountPerHead} for ${match.title}`,
        htmlContent,
      },
      {
        headers: {
          accept: "application/json",
          "api-key": process.env.BREVO_API_KEY,
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

router.get("/pay-redirect", async (req, res) => {
  let { pa, pn, am, tn } = req.query;

  // 1. Format Amount (e.g., "10.00")
  if (am && !am.includes(".")) {
    am = parseFloat(am).toFixed(2);
  }

  // 2. Clean & Encode Strings
  // We keep "+" in the regex if you want spaces to look like "Paise+de+do" 
  // though standard encoding usually handles spaces as %20.
  const cleanPn = pn ? pn.replace(/[^a-zA-Z0-9 ]/g, "") : "Merchant";
  const cleanTn = tn ? tn.replace(/[^a-zA-Z0-9 ]/g, "") : "Payment";

  const encodedPn = encodeURIComponent(cleanPn);
  const encodedTn = encodeURIComponent(cleanTn); // Encodes spaces to %20 or +

  // 3. CONSTRUCT THE EXACT QUERY STRING
  // Added: mode=02, ver=01, txntype=pay, orgid=000000 (Generic ID), qrmedium=02
  const queryParams = `mode=02&ver=01&pa=${pa}&pn=${encodedPn}&txntype=pay&qrmedium=02&tn=${encodedTn}&am=${am}&orgid=000000&cu=INR`;

  const links = {
    generic: `upi://pay?${queryParams}`,
    phonepe: `phonepe://pay?${queryParams}`,
    paytm: `paytmmp://pay?${queryParams}`,
    gpay: `gpay://upi/pay?${queryParams}`, 
    mobikwik: `mobikwik://upi/pay?${queryParams}`
  };

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Pay ₹${am}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
           body { font-family: -apple-system, sans-serif; text-align: center; padding: 20px; background: #f3f4f6; color: #1f2937; }
           .card { background: white; padding: 25px 20px; border-radius: 16px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); max-width: 400px; margin: 20px auto; }
           
           h2 { margin: 0 0 10px 0; color: #10b981; }
           p { color: #6b7280; margin-bottom: 25px; }
           .amount { font-size: 2.5rem; font-weight: 800; color: #111827; margin: 10px 0; }
           
           .btn { 
             display: flex; align-items: center; justify-content: center;
             width: 100%; padding: 14px; margin-bottom: 12px;
             border-radius: 10px; text-decoration: none; 
             color: white; font-weight: 600; font-size: 16px; 
           }
           
           .phonepe { background: #5f259f; }
           .paytm { background: #00baf2; }
           .gpay { background: #3c4043; }
           .mobikwik { background: #0093d6; }
           .generic { background: #10b981; margin-top: 10px; }
           .note { font-size: 12px; color: #9ca3af; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="card">
          <h2>TurfWar Payment</h2>
          <div class="amount">₹${am}</div>
          <p>To: <strong>${cleanPn}</strong></p>
          
          <a class="btn phonepe" href="${links.phonepe}">Pay via PhonePe</a>
          <a class="btn paytm" href="${links.paytm}">Pay via Paytm</a>
          <a class="btn gpay" href="${links.gpay}">Pay via Google Pay</a>
          <a class="btn mobikwik" href="${links.mobikwik}">Pay via MobiKwik</a>
          
          <a class="btn generic" href="${links.generic}">Other UPI Apps</a>

          <div class="note">
            If payment fails, try a different app.<br/>
          </div>
        </div>
      </body>
    </html>
  `;
  res.send(html);
});

module.exports = router;
