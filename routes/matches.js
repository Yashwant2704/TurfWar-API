const router = require('express').Router();
const Match = require('../models/Match');
const auth = require('../middleware/authMiddleware');

// Get all matches (Public)
router.get('/', async (req, res) => {
  try {
    const matches = await Match.find().sort({ date: 1 });
    res.json(matches);
  } catch (err) { res.status(500).send('Server Error'); }
});

// Create Match (Organizer Only)
router.post('/', auth, async (req, res) => {
  if (req.user.user.role !== 'organizer') return res.status(403).json({ message: "Access Denied" });
  
  try {
    const newMatch = new Match({ ...req.body, createdBy: req.user.user.id });
    await newMatch.save();
    res.json(newMatch);
  } catch (err) { res.status(500).send('Server Error'); }
});

// Join Match (Authenticated Users)
router.post('/:id/join', auth, async (req, res) => {
  try {
    const match = await Match.findById(req.params.id);
    if (match.players.some(p => p.userId === req.user.user.id)) {
      return res.status(400).json({ message: "Already joined" });
    }
    match.players.push({ 
      userId: req.user.user.id, 
      name: req.user.user.name, 
      role: req.body.role, 
      skill: req.body.skill 
    });
    await match.save();
    res.json(match);
  } catch (err) { res.status(500).send('Server Error'); }
});

// Comment (Chat)
router.post('/:id/comment', auth, async (req, res) => {
  try {
    const match = await Match.findById(req.params.id);
    match.comments.push({ user: req.user.user.name, text: req.body.text });
    await match.save();
    res.json(match);
  } catch (err) { res.status(500).send('Server Error'); }
});

// PUT /api/matches/:id - Update match details
router.put('/:id', auth, async (req, res) => {
  try {
    const { title, turfName, date, costPerHour, durationHours } = req.body;
    
    let match = await Match.findById(req.params.id);
    if (!match) return res.status(404).json({ message: "Match not found" });

    // Check ownership
    if (match.createdBy !== req.user.user.id) {
      return res.status(401).json({ message: "Not authorized to edit this match" });
    }

    // Update fields
    match.title = title || match.title;
    match.turfName = turfName || match.turfName;
    match.date = date || match.date;
    match.costPerHour = costPerHour || match.costPerHour;
    match.durationHours = durationHours || match.durationHours;

    await match.save();
    res.json(match);
  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
});

// PUT /api/matches/:id/score - Finalize match & declare winner
router.put('/:id/score', auth, async (req, res) => {
  try {
    const { winner, score } = req.body;

    const match = await Match.findById(req.params.id);
    if (!match) {
      return res.status(404).json({ message: "Match not found" });
    }

    // Only organizer can finalize
    if (match.createdBy !== req.user.user.id) {
      return res.status(403).json({ message: "Only organizer can finalize match" });
    }

    // Prevent double finalization
    if (match.result?.isCompleted) {
      return res.status(400).json({ message: "Match already completed" });
    }

    match.result = {
      winner,
      score,
      isCompleted: true,
      completedAt: new Date()
    };

    await match.save();
    res.json(match);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server Error" });
  }
});


// PUT /api/matches/:id/payment - Toggle Player Payment Status
router.put('/:id/payment', auth, async (req, res) => {
  try {
    const { playerId, status } = req.body; // status will be 'Paid' or 'Pending'
    
    const match = await Match.findById(req.params.id);
    if (!match) return res.status(404).json({ message: "Match not found" });

    // Check if user is the organizer
    if (match.createdBy !== req.user.user.id) {
      return res.status(403).json({ message: "Only organizer can manage money" });
    }

    // Find the player and update status
    const player = match.players.id(playerId);
    if (!player) return res.status(404).json({ message: "Player not found" });

    player.paymentStatus = status; // Update the status
    
    await match.save();
    res.json(match);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/matches/:id/guest - Add a manual guest player
router.post('/:id/guest', auth, async (req, res) => {
  try {
    const { name, email, role } = req.body;
    
    const match = await Match.findById(req.params.id);
    if (!match) return res.status(404).json({ message: "Match not found" });

    // Only organizer can add guests
    if (match.createdBy !== req.user.user.id) {
      return res.status(403).json({ message: "Only organizer can add guests" });
    }

    // Add the guest player
    match.players.push({
      userId: null, // No user ID
      name: name,
      email: email || "", // Optional email for reminders
      role: role || 'All-Rounder',
      isGuest: true,
      paymentStatus: 'Pending'
    });

    await match.save();
    res.json(match);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


module.exports = router;