const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const enrollmentController = require('../controllers/enrollmentController');

// File upload configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = file.fieldname === 'photo' ? 'uploads/photos' : 'uploads/documents';
    cb(null, path.join(__dirname, '../', uploadDir));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB max file size
  }
});

// Handle file uploads for updating enrollment
const uploadFields = upload.fields([
  { name: 'photo', maxCount: 1 },
  { name: 'aadharPdf', maxCount: 1 }
]);

// Create enrollment route (basic details)
router.post('/', enrollmentController.createEnrollment);

// Update enrollment route (complete details)
router.put('/:id', uploadFields, enrollmentController.updateEnrollment);

// Get enrollment details
router.get('/:id', enrollmentController.getEnrollment);

// Get enrollment by email or enrollment ID
router.post('/fetch', enrollmentController.getEnrollmentByEmailOrId);

// Test PDF generation
router.post('/test-pdf', enrollmentController.testPDF);

module.exports = router;