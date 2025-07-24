const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const dotenv = require('dotenv');
const enrollmentRoutes = require('./routes/enrollmentRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const couponRoutes = require('./routes/couponRoutes');
const referralRoutes = require('./routes/referralRoutes'); // Import referral routes
const teacherRoutes = require('./routes/teacherRoutes'); // Import teacher routes
const { connectDB } = require('./config/db');

dotenv.config();

// Initialize express app
const app = express();

// Connect to database
connectDB();

// Middleware
const corsOptions = {
  origin: 'https://register.educatory.ac', // Allow requests from the frontend domain
  // origin: 'http://localhost:3000', // Allow requests from the frontend domain
  credentials: true, // Allow cookies and credentials
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE', // Allow all HTTP methods
  allowedHeaders: 'Content-Type,Authorization', // Allow specific headers
  optionSuccessStatus: 200,
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // Handle preflight requests
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// File upload configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = file.fieldname === 'photo' ? 'uploads/photos' : 'uploads/documents';
    cb(null, path.join(__dirname, uploadDir));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

const fileFilter = (req, file, cb) => {
  if (file.fieldname === 'photo') {
    if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/png') {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG and PNG files are allowed for photos'), false);
    }
  } else if (file.fieldname === 'aadharPdf') {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed for Aadhar documents'), false);
    }
  } else {
    cb(null, false);
  }
};

const upload = multer({
  storage: storage,
  limits: {
    fileSize: file => {
      if (file.fieldname === 'photo') {
        return 2 * 1024 * 1024; // 2MB limit for photos
      } else {
        return 5 * 1024 * 1024; // 5MB limit for documents
      }
    }
  },
  fileFilter: fileFilter
});

// Make uploads directory accessible
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/enrollments', enrollmentRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/coupons', couponRoutes);
app.use('/api/referrals', referralRoutes); // Add referral routes
app.use('/api/teachers', teacherRoutes); // Add teacher routes

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    success: false, 
    message: 'Server error', 
    error: process.env.NODE_ENV === 'development' ? err.message : undefined 
  });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
