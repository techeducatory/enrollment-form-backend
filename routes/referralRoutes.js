const express = require('express');
const router = express.Router();
const referralController = require('../controllers/referralController');

router.post('/validate', referralController.validateReferralCode);

module.exports = router;
