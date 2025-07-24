const express = require('express');
const router = express.Router();
const teacherController = require('../controllers/teacherController');

router.post('/register', teacherController.registerTeacher);
router.get('/referrals', teacherController.getReferralStudents);

module.exports = router;
