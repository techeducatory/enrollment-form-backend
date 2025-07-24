const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');

// Create a new Razorpay order
router.post('/create-order', paymentController.createOrder);

// Verify payment
router.post('/verify', paymentController.verifyPayment);

module.exports = router;