const { pool, getNextInvoiceNumber } = require('../config/db');
const { generateEnrollmentId, generateReferralCode, generateCouponCode } = require('../utils/helpers');
const { createCouponImage } = require('../utils/couponGenerator');
const { sendEmail } = require('../utils/emailService');
const { generateEnrollmentPDF } = require('../utils/pdfGenerator');
const { generateInvoicePDF } = require('../utils/invoiceGenerator');
const path = require('path');

exports.createEnrollment = async (req, res) => {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const {
      firstName, lastName, email, phone, aadharNumber,
      address, city, district, state, pinCode, courseName, courseId, courseFee,
      referralCode
    } = req.body;

    // Step 1: Check for existing enrollment in this course (any status)
    const [existingEnrollments] = await connection.query(
      `SELECT enrollment_id, course_name, enrollment_status, email, phone, aadhar_number
       FROM enrollments
       WHERE (email = ? OR phone = ? OR aadhar_number = ?)
       AND course_name = ?`,
      [email, phone, aadharNumber, courseName]
    );

    if (existingEnrollments.length > 0) {
      const existing = existingEnrollments[0];

      if (existing.enrollment_status === 'pending') {

        if ( existing.course_name == courseName && 
          existing.firstName == firstName && 
          existing.lastName == lastName && 
          existing.email == email && 
          existing.phone == phone && 
          existing.aadharNumber == aadharNumber && 
          existing.address == address && 
          existing.city == city && 
          existing.district == district && 
          existing.state == state && 
          existing.pinCode == pinCode &&
          existing.courseFee == courseFee &&
          existing.courseId == courseId) {
          // If all details match, skip update to move forward
          res.status(200).json({
            success: true,
            duplicateCourse: false,
            message: "",
            warningMessage: ""
          });
        }

        // Update pending enrollment
        await connection.query(
          `UPDATE enrollments SET 
            first_name = ?, last_name = ?, email = ?, phone = ?, 
            aadhar_number = ?, address = ?, city = ?, state = ?, 
            pin_code = ?, course_fee = ?
          WHERE enrollment_id = ?`,
          [
            firstName, lastName, email, phone,
            aadharNumber, address, city, state,
            pinCode, courseFee,
            existing.enrollment_id
          ]
        );

        if (referralCode) {
          const referralController = require('./referralController');
          await referralController.applyReferralCode(referralCode, existing.enrollment_id, connection);
        }

        await connection.commit();
        const fullAddress = `${address}, ${city}, ${district}, ${state}, ${pinCode}`;
        const emailHtml = buildEmailHtml(firstName, lastName, email, phone, courseName, existing.enrollment_id, courseId, aadharNumber, fullAddress);
        const attachments = [
          {
            filename: 'already-registered.jpg',
            path: path.join(__dirname, '../assets/already-registered.jpg')
          }
        ];

        await sendEmail(
          email,
          'Your Basic Details has been updated with Educatory',
          emailHtml,
          attachments
        );

        return res.status(200).json({
          success: true,
          enrollmentId: existing.enrollment_id,
          updated: true,
          message: 'Pending enrollment updated successfully'
        });
      } else {
        let matchedFields = [];
        if (existingEnrollments.length > 0) {
          const match = existingEnrollments[0];
          console.log('match', match);
          if (match.email === email) matchedFields.push('email');
          if (match.phone === phone) matchedFields.push('mobile');
          if (match.aadhar_number === aadharNumber) matchedFields.push('aadhar');
        }

        return res.status(400).json({
          success: false,
          existingStudent: true,
          matchedFields,
          message: `Existing student found with same ${matchedFields.join(', ')} in this course`,
          warningMessage: `You are already enrolled in "${courseName}" with Registration ID "${existing.enrollment_id}". Each student can enroll only once in a course.`
        });
      }
    }

    // Step 2: Check if user is an existing student in any completed course
    const [existingCompleted] = await connection.query(
      `SELECT enrollment_id
       FROM enrollments
       WHERE (email = ? OR phone = ? OR aadhar_number = ?)
       AND enrollment_status = 'completed' AND course_id = ?`,
      [email, phone, aadharNumber, courseId]
    );

    if (existingCompleted.length > 0) {
      let matchedFields = [];
      if (existingCompleted.length > 0) {
        const match = existingCompleted[0];
        if (match.email === email) matchedFields.push('email');
        if (match.phone === phone) matchedFields.push('mobile');
        if (match.aadhar_number === aadharNumber) matchedFields.push('aadhar');
      }

      return res.status(400).json({
        success: false,
        existingStudent: true,
        matchedFields,
        message: `Existing student found with same ${matchedFields.join(', ')}`,
        warningMessage: `As an existing student (Registration ID: ${existingCompleted[0].enrollment_id}), you cannot use referral codes. However, you can still enroll in this new course.`
      });
    }

    // Step 3: Create new enrollment
    const enrollmentId = await generateEnrollmentId();

    await connection.query(
      `INSERT INTO enrollments 
      (enrollment_id, first_name, last_name, email, phone, aadhar_number, address, city, district, state, pin_code, course_name, course_id, course_fee) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [enrollmentId, firstName, lastName, email, phone, aadharNumber, address, city, district, state, pinCode, courseName, courseId, courseFee]
    );

    if (referralCode) {
      const referralController = require('./referralController');
      await referralController.applyReferralCode(referralCode, enrollmentId, connection);
    }

    await connection.commit();
    const fullAddress = `${address}, ${city}, ${district}, ${state}, ${pinCode}`;
    const emailHtml = buildEmailHtml(firstName, lastName, email, phone, courseName, enrollmentId, courseId, aadharNumber, fullAddress);
    const attachments = [
      {
        filename: 'already-registered.jpg',
        path: path.join(__dirname, '../assets/already-registered.jpg')
      }
    ];

    await sendEmail(
      email,
      'Registration Initiated with Educatory',
      emailHtml,
      attachments
    );

    res.status(201).json({
      success: true,
      enrollmentId,
      message: 'Basic details saved successfully'
    });

  } catch (error) {
    await connection.rollback();
    console.error('Error creating enrollment:', error);
    res.status(500).json({ success: false, message: 'Failed to create enrollment', error: error.message });
  } finally {
    connection.release();
  }
};

// Helper to build the email HTML
function buildEmailHtml(firstName, lastName, email, phone, courseName, enrollmentId, courseId, aadharNumber, address) {
  return `
    <p>Dear ${firstName} ${lastName},</p>
    <p>Thank you for initiating your registration with <strong>Educatory</strong>!</p>
    <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
      <p style="margin: 5px 0;"><strong>Registration Details:</strong></p>
      <ul style="list-style-type: none; padding-left: 0;">
        <li>• Registration ID: <strong>${enrollmentId}</strong></li>
        <li>• Course Name: <strong>${courseName}</strong></li>
        <li>• Course ID: <strong>${courseId}</strong></li>
      </ul>
    </div>
    <div style="background-color: #e3f2fd; padding: 15px; border-radius: 5px; margin: 20px 0;">
      <p style="margin: 5px 0;"><strong>Details you have filled till now:</strong></p>
      <ul style="list-style-type: none; padding-left: 0;">
        <li>• Name: <strong>${firstName} ${lastName}</strong></li>
        <li>• Aadhar No: <strong>${aadharNumber}</strong></li>
        <li>• Phone: <strong>${phone}</strong></li>
        <li>• Email: <strong>${email}</strong></li>
        <li>• Address: <strong>${address}</strong></li>
      </ul>
    </div>
    <hr>
    <p style="color:#d32f2f;"><strong>In case of any disruption during registration:</strong></p>
    <ol>
      <li><a href="https://register.educatory.ac" target="_blank" style="color:#2563eb;text-decoration:underline;">Click Here</a></li>
      <li>Click on <strong>Enroll Now</strong> for the "<strong>${courseName}</strong>"</li>
      <li>Then click on the <strong>Already Registered</strong> Button (see image below)</li>
    </ol>
    <p style="margin-top:10px;">Refer to the attached image for guidance.</p>
    <p><strong>Next Steps:</strong></p>
    <ol>
      <li>Complete the payment process</li>
      <li>Fill in additional details</li>
      <li>Upload required documents</li>
    </ol>
    <p>Please save your Registration ID for future reference.</p>
    <p>For any assistance, contact our support team.</p>
    <p>Best Regards,<br>Team Educatory</p>
  `;
}

// Update enrollment with complete details
exports.updateEnrollment = async (req, res) => {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // FIX: Use enrollmentId from req.params.id if not present in body
    const enrollmentId = req.body.enrollmentId || req.params.id;
    const photoPath = req.files && req.files.photo ? req.files.photo[0].path : null;
    const aadharPdfPath = req.files && req.files.aadharPdf ? req.files.aadharPdf[0].path : null;

    const {
      schoolName, schoolCity, schoolDistrict, schoolState, schoolPinCode,
      fatherName, fatherOccupation, fatherPhone, fatherEmail, fatherAddress,
      fatherCity, fatherDistrict, fatherState, fatherPinCode,
      motherName, motherOccupation, motherPhone, motherEmail, motherAddress,
      motherCity, motherDistrict, motherState, motherPinCode,
      referenceSource, email, firstName, lastName,
      courseId
    } = req.body;

    // Update enrollment record
    const [result] = await connection.query(
      `UPDATE enrollments SET
        school_name = ?,
        school_city = ?,
        school_district = ?,
        school_state = ?,
        school_pin_code = ?,
        father_name = ?,
        father_occupation = ?,
        father_phone = ?,
        father_email = ?,
        father_address = ?,
        father_city = ?,
        father_district = ?,
        father_state = ?,
        father_pin_code = ?,
        mother_name = ?,
        mother_occupation = ?,
        mother_phone = ?,
        mother_email = ?,
        mother_address = ?,
        mother_city = ?,
        mother_district = ?,
        mother_state = ?,
        mother_pin_code = ?,
        reference_source = ?,
        photo_path = COALESCE(?, photo_path),
        aadhar_pdf_path = COALESCE(?, aadhar_pdf_path),
        enrollment_status = 'completed'
        WHERE enrollment_id = ?`,
      [
        schoolName, schoolCity, schoolDistrict, schoolState, schoolPinCode,
        fatherName, fatherOccupation, fatherPhone, fatherEmail, fatherAddress,
        fatherCity, fatherDistrict, fatherState, fatherPinCode,
        motherName, motherOccupation, motherPhone, motherEmail, motherAddress,
        motherCity, motherDistrict, motherState, motherPinCode,
        referenceSource, photoPath, aadharPdfPath, enrollmentId
      ]
    );

    if (result.affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Registration not found' });
    }

    // Get enrollment data with payment details
    const [enrollmentRows] = await connection.query(
      `SELECT e.*, 
            p.razorpay_payment_id as payment_id,
            p.amount as payment_amount,
            p.created_at as payment_date
      FROM enrollments e
      LEFT JOIN payments p ON e.enrollment_id = p.enrollment_id
      WHERE e.enrollment_id = ?
      ORDER BY p.created_at DESC
      LIMIT 1`,
      [enrollmentId]
    );

    const enrollmentData = enrollmentRows[0];
    const pdfPath = await generateEnrollmentPDF({ ...enrollmentData, ...enrollmentData });

    // --- Generate Invoice PDF ---
    // Calculate GST, CGST, SGST, IGST, etc.
    // Calculate base fee (excluding GST) if course_fee/payment_amount includes GST
    // Both payment_amount and course_fee are inclusive of GST (18%)
    // let fee;
    // if (enrollmentData.payment_amount) {
    //   // payment_amount is inclusive of GST, so extract base amount
    //   fee = +(Number(enrollmentData.payment_amount) / 1.18).toFixed(2);
    // } else {
    //   // course_fee is also inclusive of GST, so extract base amount
    //   fee = +(Number(enrollmentData.course_fee || 0) / 1.18).toFixed(2);
    // }
    // const gst = +(fee * 0.18).toFixed(2);
    // // Calculate GST based on student's state (Delhi: CGST+SGST, others: IGST)
    // let cgst = 0, sgst = 0, igst = 0;
    // if ((enrollmentData.state || '').trim().toLowerCase() === 'delhi') {
    //   cgst = +(fee * 0.09).toFixed(2);
    //   sgst = +(fee * 0.09).toFixed(2);
    //   igst = 0;
    // } else {
    //   cgst = 0;
    //   sgst = 0;
    //   igst = +(fee * 0.18).toFixed(2);
    // }
    // const total = +(fee + gst).toFixed(2);

    // Fetch payment mode and details from payment gateway response (if available)
    // Since payment_mode and payment_details are not present in the DB, use fallback logic
    // const paymentMode = enrollmentData.payment_id ? 'Online' : 'Pending';
    // const paymentDetails = enrollmentData.payment_id || '';

    // Get or generate invoice number for this enrollment
    // const invoiceNumber = await getNextInvoiceNumber(enrollmentId, connection);

    // // Academic year in format YYYY-(YY+1)
    // const paymentYear = enrollmentData.payment_date
    //   ? new Date(enrollmentData.payment_date)
    //   : new Date();
    // const year = paymentYear.getFullYear();
    // const nextYearShort = (year + 1).toString().slice(-2);
    // const academicYear = `${year}-${nextYearShort}`;

    // const invoiceData = {
    //   pan: 'AAVCS5734K',
    //   tan: 'DELS59705C',
    //   companyReg: '278470',
    //   cin: 'U80900DL2015PTC278470',
    //   company: 'Educatory',
    //   companyAddress: 'Plot No. 96, Patparganj Industrial Area, East Delhi, Delhi, 110092',
    //   companyPhones: '+91-7290068844, +91-7290068850',
    //   studentName: enrollmentData.first_name + ' ' + enrollmentData.last_name,
    //   studentEmail: enrollmentData.email,
    //   studentAddress: enrollmentData.address,
    //   registration: enrollmentData.enrollment_id,
    //   course: enrollmentData.course_name,
    //   batch: academicYear, // Use academic year here
    //   amount: fee,
    //   gst,
    //   cgst,
    //   sgst,
    //   igst,
    //   gstNumber: '09AJVPB1925H1Z2',
    //   gstState: 'Delhi',
    //   total,
    //   rc: enrollmentData.course_name,
    //   rb: academicYear, // Use academic year here
    //   payment: paymentMode, // Use fallback logic
    //   paymentDetails: paymentDetails, // Use fallback logic
    //   generatedBy: 'System',
    //   status: 'Completed',
    //   date: enrollmentData.payment_date ? new Date(enrollmentData.payment_date).toLocaleDateString('en-IN') : new Date().toLocaleDateString('en-IN'),
    //   inno: invoiceNumber, // Use invoice number instead of payment_id/enrollment_id
    //   invoiceNumber,       // Add invoiceNumber field for clarity
    // };

    // const invoicePath = await generateInvoicePDF(invoiceData);

    // Prepare email attachments (add invoice)
    const attachments = [
      {
        filename: `enrollment-${enrollmentId}.pdf`,
        path: pdfPath
      },
      {
        filename: 'photo.' + photoPath.split('.').pop(),
        path: photoPath
      },
      {
        filename: 'aadhar.' + aadharPdfPath.split('.').pop(),
        path: aadharPdfPath
      },
      // {
      //   filename: `invoice-${enrollmentId}.pdf`,
      //   path: invoicePath
      // }
    ];

    // Generate and store referral code
    const referralCode = await generateReferralCode();
    await connection.query(
      'INSERT INTO referrals (enrollment_id, referral_code) VALUES (?, ?)',
      [enrollmentId, referralCode]
    );

    // Check if referral code was used and handle different referral types
    const [referralUse] = await connection.query(
      `SELECT r.*, e.first_name, e.last_name, e.email,
              p.razorpay_payment_id, p.amount,
              tr.id as teacher_id, tr.name as teacher_name,
              tr.email as teacher_email, tr.type as teacher_type,
              tr.institution_name, tr.commission_per_referral
       FROM referral_uses ru
       LEFT JOIN referrals r ON ru.referral_code = r.referral_code
       LEFT JOIN enrollments e ON r.enrollment_id = e.enrollment_id
       LEFT JOIN payments p ON ru.referred_enrollment_id = p.enrollment_id
       LEFT JOIN teacher_referrals tr ON ru.referral_code = tr.referral_code
       WHERE ru.referred_enrollment_id = ? 
       AND ru.validation_status = 'approved'
       AND (r.status = 'active' OR tr.status = 'active')`,
      [enrollmentId]
    );

    if (referralUse.length > 0) {
      if (referralUse[0].teacher_id) {
        // Handle teacher referral
        const commission = referralUse[0].commission_per_referral;

        // Record teacher referral commission
        await connection.query(
          `INSERT INTO teacher_referral_uses 
           (referral_code, enrollment_id, commission_amount) 
           VALUES (?, ?, ?)`,
          [referralUse[0].referral_code, enrollmentId, commission]
        );

        // Get all referrals by this teacher
        const [teacherReferrals] = await connection.query(
          `SELECT e.enrollment_id, e.first_name, e.last_name,
                  e.course_name, e.created_at, p.amount as paid_amount,
                  tru.commission_amount, tru.paid_status
           FROM teacher_referral_uses tru
           JOIN enrollments e ON tru.enrollment_id = e.enrollment_id
           LEFT JOIN payments p ON e.enrollment_id = p.enrollment_id
           WHERE tru.referral_code = ?
           ORDER BY tru.created_at DESC`,
          [referralUse[0].referral_code]
        );

        // Send teacher referral update email
        await sendEmail(
          referralUse[0].teacher_email,
          'New Student Enrollment Through Your Referral',
          // `<p>Dear ${referralUse[0].teacher_name},</p>
          //  <p>A new student has successfully enrolled through your referral.</p>
          //  <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
          //    <p><strong>Latest Referral Details:</strong></p>
          //    <ul>
          //      <li>Student Name: ${firstName} ${lastName}</li>
          //      <li>Course: ${enrollmentData.course_name}</li>
          //      <li>Commission Amount: ₹${commission}</li>
          //    </ul>
          //  </div>
          //  <h4>All Referrals Summary:</h4>
          //  <table style="width:100%; border-collapse: collapse;">
          //    <tr style="background-color: #f8f9fa;">
          //      <th style="padding: 10px; border: 1px solid #ddd;">Registration ID</th>
          //      <th style="padding: 10px; border: 1px solid #ddd;">Student Name</th>
          //      <th style="padding: 10px; border: 1px solid #ddd;">Course</th>
          //      <th style="padding: 10px; border: 1px solid #ddd;">Commission</th>
          //      <th style="padding: 10px; border: 1px solid #ddd;">Status</th>
          //    </tr>
          //    ${teacherReferrals.map(ref => `
          //      <tr>
          //        <td style="padding: 8px; border: 1px solid #ddd;">${ref.enrollment_id}</td>
          //        <td style="padding: 8px; border: 1px solid #ddd;">${ref.first_name} ${ref.last_name}</td>
          //        <td style="padding: 8px; border: 1px solid #ddd;">${ref.course_name}</td>
          //        <td style="padding: 8px; border: 1px solid #ddd;">₹${ref.commission_amount}</td>
          //        <td style="padding: 8px; border: 1px solid #ddd;">${ref.paid_status}</td>
          //      </tr>
          //    `).join('')}
          //  </table>
          //  <p>Thank you for your continued support in growing our community!</p>
          //  <p>Best Regards,<br>Team Educatory</p>`
          `<p>Dear ${referralUse[0].teacher_name},</p>
           <p>A new student has successfully enrolled through your referral.</p>
           <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
             <p><strong>Latest Referral Details:</strong></p>
             <ul>
               <li>Student Name: ${firstName} ${lastName}</li>
               <li>Course: ${enrollmentData.course_name}</li>
               <li> Click <a href="https://register.educatory.ac/mentor-dashboard?referralCode=${referralUse[0].referral_code}">here</a> to see the list of all the students enrolled at educatory recommended by you.</li>
             </ul>
           </div>
           <h4>All Referrals Summary:</h4>
           <table style="width:100%; border-collapse: collapse;">
             <tr style="background-color: #f8f9fa;">
               <th style="padding: 10px; border: 1px solid #ddd;">Registration ID</th>
               <th style="padding: 10px; border: 1px solid #ddd;">Student Name</th>
               <th style="padding: 10px; border: 1px solid #ddd;">Course</th>
               <th style="padding: 10px; border: 1px solid #ddd;">Status</th>
             </tr>
             ${teacherReferrals.map(ref => `
               <tr>
                 <td style="padding: 8px; border: 1px solid #ddd;">${ref.enrollment_id}</td>
                 <td style="padding: 8px; border: 1px solid #ddd;">${ref.first_name} ${ref.last_name}</td>
                 <td style="padding: 8px; border: 1px solid #ddd;">${ref.course_name}</td>
                 <td style="padding: 8px; border: 1px solid #ddd;">${ref.paid_status}</td>
               </tr>
             `).join('')}
           </table>
           <p>Thank you for your continued support in growing our community!</p>
           <p>Best Regards,<br>Team Educatory</p>`
        );

      } else {
        // Handle student referral with coupon (existing code)
        const couponCode = generateCouponCode();
        const couponAmount = Math.round(enrollmentData.course_fee * 0.1);
        const couponImageData = await createCouponImage(couponCode, couponAmount);

        await connection.query(
          `INSERT INTO coupons (
            coupon_code, referral_code, amount, 
            transaction_id, payment_link
          ) VALUES (?, ?, ?, ?, ?)`,
          [
            couponCode,
            referralUse[0].referral_code,
            couponAmount,
            referralUse[0].razorpay_payment_id,
            `${process.env.FRONTEND_URL}/payment/${referralUse[0].razorpay_payment_id}`
          ]
        );

        // Send email with embedded image
        await sendEmail(
          referralUse[0].email,
          'You have earned a Onetime Use Lifetime Coupon!',
          `<p>Dear ${referralUse[0].first_name} ${referralUse[0].last_name},</p>
           <p>Great news! The student you referred has successfully completed their enrollment.</p>
           <p>As a reward for your referral, you have earned a <strong>Onetime Use Lifetime Coupon</strong> worth ₹${couponAmount}!</p>
           <div style="text-align: center; margin: 20px 0;">
             <img src="cid:couponImage" alt="Your Coupon" style="max-width: 600px; width: 100%; height: auto;" />
           </div>
           <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
             <p style="font-size: 18px; text-align: center; margin: 0;">Your Coupon Code: <strong>${couponCode}</strong></p>
           </div>
           <p><strong>Important Notes:</strong></p>
           <ul>
             <li>This is a one-time use lifetime coupon</li>
             <li>The coupon will be verified through OTP sent to your registered email</li>
             <li>Minimum course fee after coupon application must be ₹1</li>
             <li>If course fee goes below ₹1, coupon amount will be adjusted automatically</li>
           </ul>
           <p>Reference Transaction: ${referralUse[0].razorpay_payment_id}</p>
           <p>Thank you for being part of our community!</p>
           <p>Best Regards,<br>Team Educatory</p>`,
          [{
            filename: 'coupon.png',
            content: couponImageData.buffer,
            cid: 'couponImage',
            contentType: 'image/png',
            contentDisposition: 'inline'
          }]
        );
      }
    }

    await connection.commit();

    // Send email with attachments (completion email FIRST)
    const subject = 'Registration Completed Successfully';
    const html = `
      <p>Dear ${firstName} ${lastName},</p>
      <p>Congratulations! Your registration process with <strong>Educatory</strong> has been successfully completed.</p>
      <ul style="list-style-type: none; padding-left: 0;">
        <li>• Registration ID: <strong>${enrollmentId}</strong></li>
        <li>• Registered Email: <strong>${email}</strong></li>
      </ul>
      <p>Please find attached:</p>
      <ul>
        <li>Your enrollment details</li>
        <li>Your submitted photo</li>
        <li>Your Aadhar document</li>
      </ul>
      <p>Please save these documents for future reference.</p>
      <p>Best Regards,<br>Team Educatory</p>
    `;

    await sendEmail(email, subject, html, attachments, true);

    // Send referral program email (send AFTER completion email)
    const referralSubject = 'Earn Discounts with Our Referral Program!';
    const referralHtml = `
      <p>Dear ${firstName} ${lastName},</p>
      <p>Thank you for registering with Educatory! We're excited to have you join our learning community.</p>
      <h3>💫 Introducing Our Referral Program!</h3>
      <p>Share your unique referral code with friends and earn amazing discounts:</p>
      <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <p style="font-size: 18px; text-align: center; margin: 0;">Your Referral Code: <strong>${referralCode}</strong></p>
      </div>
      <h4>How it works:</h4>
      <ol>
        <li>Share your referral code with friends</li>
        <li>When they register using your code, they get 10% off their course fee</li>
        <li>You also get 10% off per referral as a coupon!</li>
      </ol>
      <p><strong>The more you share, the more you save!</strong></p>
      <p>Terms and conditions:</p>
      <ul>
        <li>Discount applies to total course fee</li>
        <li>Both referrer and referee must maintain active enrollment</li>
        <li>Referral code must be used during the registration process</li>
      </ul>
      <p>Best Regards,<br>Team Educatory</p>
    `;

    // await sendEmail(email, referralSubject, referralHtml, true);

    res.status(200).json({
      success: true,
      message: 'Registration completed successfully. Emails sent to the user.'
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error updating enrollment:', error);
    res.status(500).json({ success: false, message: 'Failed to update enrollment', error: error.message });
  } finally {
    connection.release();
  }
};

// Get enrollment by ID
exports.getEnrollment = async (req, res) => {
  try {
    const enrollmentId = req.params.id;

    const [rows] = await pool.query(
      'SELECT * FROM enrollments WHERE enrollment_id = ?',
      [enrollmentId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Registration not found' });
    }

    res.status(200).json({
      success: true,
      data: rows[0]
    });
  } catch (error) {
    console.error('Error fetching enrollment:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch enrollment', error: error.message });
  }
};

// Get enrollment by email or enrollment ID
exports.getEnrollmentByEmailOrId = async (req, res) => {
  try {
    const { userInput, courseId } = req.body;

    const [rows] = await pool.query(
      `SELECT * FROM enrollments 
       WHERE (enrollment_id = ? OR email = ?) AND course_id = ?`,
      [userInput, userInput, courseId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Registration not found' });
    }

    res.status(200).json({
      success: true,
      data: rows[0]
    });
  } catch (error) {
    console.error('Error fetching enrollment:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch enrollment', error: error.message });
  }
};

// Test PDF generation and email
exports.testPDF = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { email } = req.body;
    console.log('Testing PDF generation for email:', email);
    // Get enrollment data with payment details
    const [enrollmentRows] = await connection.query(
      `SELECT e.*, 
              p.razorpay_payment_id as payment_id,
              p.created_at as payment_date,
              p.amount as payment_amount
       FROM enrollments e
       LEFT JOIN payments p ON e.enrollment_id = p.enrollment_id
       WHERE e.email = ?
       ORDER BY e.created_at DESC
       LIMIT 1`,
      [email]
    );

    if (enrollmentRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No enrollment found for this email'
      });
    }

    const enrollmentData = enrollmentRows[0];
    const pdfPath = await generateEnrollmentPDF(enrollmentData);

    // Prepare attachments
    const attachments = [{
      filename: `enrollment-${enrollmentData.enrollment_id}.pdf`,
      path: pdfPath
    }];

    // Add photo and aadhar if they exist
    if (enrollmentData.photo_path) {
      attachments.push({
        filename: 'photo.' + enrollmentData.photo_path.split('.').pop(),
        path: enrollmentData.photo_path
      });
    }

    if (enrollmentData.aadhar_pdf_path) {
      attachments.push({
        filename: 'aadhar.' + enrollmentData.aadhar_pdf_path.split('.').pop(),
        path: enrollmentData.aadhar_pdf_path
      });
    }

    // Send test email
    await sendEmail(
      email,
      'Test - Enrollment Details PDF',
      `<p>Dear ${enrollmentData.first_name},</p>
       <p>Here is your enrollment details PDF for testing purposes.</p>
       <p>Registration ID: ${enrollmentData.enrollment_id}</p>
       <p>Best Regards,<br>Team Educatory</p>`,
      attachments
    );

    res.status(200).json({
      success: true,
      message: 'PDF generated and sent to email successfully',
      enrollmentId: enrollmentData.enrollment_id
    });

  } catch (error) {
    console.error('Error in test PDF:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate/send PDF',
      error: error.message
    });
  } finally {
    connection.release();
  }
};