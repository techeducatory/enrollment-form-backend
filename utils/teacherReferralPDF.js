const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

exports.generateTeacherReferralPDF = async (teacherData, showTeacherDetails) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 40,
        bufferPages: true
      });

      const pdfPath = path.join(__dirname, `../temp/teacher_referral_${Date.now()}.pdf`);
      const writeStream = fs.createWriteStream(pdfPath);
      doc.pipe(writeStream);

      // Enhanced color scheme
      const colors = {
        primary: '#2563EB',
        primaryLight: '#3B82F6',
        primaryDark: '#1E40AF',
        secondary: '#059669',
        secondaryLight: '#10B981',
        accent: '#DC2626',
        accentLight: '#EF4444',
        dark: '#1F2937',
        darkLight: '#374151',
        light: '#F8FAFC',
        lightBlue: '#EFF6FF',
        lightGreen: '#F0FDF4',
        text: '#374151',
        textLight: '#6B7280',
        white: '#FFFFFF',
        shadow: '#E5E7EB',
        shadowDark: '#D1D5DB',
        gold: '#F59E0B',
        goldLight: '#FCD34D',
        themeDark: '#2b4367',
        themeLight: '#3b5a8c'
      };

      // Page dimensions
      const pageWidth = doc.page.width;
      const pageHeight = doc.page.height;
      const margin = 40;
      const usableWidth = pageWidth - (margin * 2);
      let currentY = margin;

      // Calculate footer position (fixed at bottom)
      const footerHeight = 50;
      const footerY = pageHeight - margin - footerHeight - 20;

      // === Enhanced Background with Subtle Pattern ===
      doc.save();
      const gradient = doc.linearGradient(0, 0, 0, pageHeight);
      gradient.stop(0, colors.lightBlue);
      gradient.stop(0.3, colors.white);
      gradient.stop(0.7, colors.white);
      gradient.stop(1, colors.lightGreen);
      doc.rect(0, 0, pageWidth, pageHeight).fill(gradient);
      doc.restore();

      // === Enhanced Header Section ===
      const headerHeight = 120;
      
      // Header background with gradient (no border)
      doc.save();
      const headerGradient = doc.linearGradient(margin, currentY, margin + usableWidth, currentY);
      headerGradient.stop(0, colors.white);
      headerGradient.stop(0.7, colors.white);
      headerGradient.stop(1, colors.lightBlue);
      doc.roundedRect(margin, currentY, usableWidth, headerHeight, 12)
         .fill(headerGradient);
      doc.restore();

      // Large centered logo (no border)
      const logoPath = path.join(__dirname, '../assets/educatory-logo.jpg');
      if (fs.existsSync(logoPath)) {
        const logoWidth = 270;
        const logoHeight = 100;
        const logoX = (pageWidth - logoWidth) / 2;
        const logoY = currentY + 10 ;
        
        // Create clipping path with rounded corners matching the header (no border)
        doc.save();
        doc.roundedRect(logoX, logoY, logoWidth, logoHeight, 8).clip();
        
        // Draw the image to cover the entire clipped area
        doc.image(logoPath, logoX, logoY, {
           width: logoWidth,
           height: logoHeight,
           align: 'center',
           valign: 'center'
        });
        doc.restore();
      } else {
        // Enhanced logo placeholder (centered, no border)
        const logoWidth = 200;
        const logoHeight = 80;
        const logoX = (pageWidth - logoWidth) / 2;
        const logoY = currentY + 20;
        
        // Logo background gradient (no border)
        doc.save();
        const logoGradient = doc.linearGradient(logoX, logoY, logoX + logoWidth, logoY + logoHeight);
        logoGradient.stop(0, colors.primaryLight);
        logoGradient.stop(1, colors.primaryDark);
        doc.roundedRect(logoX, logoY, logoWidth, logoHeight, 8)
           .fill(logoGradient);
        doc.restore();
        
        // Logo text centered
        doc.fontSize(32)
           .fillColor(colors.white)
           .font('Helvetica-Bold')
           .text('EDUCATORY', logoX, logoY + logoHeight/2 - 12, {
             width: logoWidth,
             align: 'center'
           });
      }

      currentY += headerHeight + 20;

      // === Main Content Section ===
      
      // Title: Exclusive Scholarship Recommendation
      doc.fontSize(20)
         .font('Helvetica-Bold')
         .fillColor(colors.dark)
         .text('Exclusive Scholarship Recommendation', margin, currentY, {
           align: 'center',
           width: usableWidth
         });

      currentY += 40;

      // Dear Student
      doc.fontSize(14)
         .font('Helvetica-Bold')
         .fillColor(colors.dark)
         .text('Dear Student,', margin, currentY);

      currentY += 25;

      // Welcome message with conditional teacher details (moved to next line)
      let welcomeText;
      if (showTeacherDetails) {
        welcomeText = `Welcome to the Educatory learning community!\n${teacherData.name.toUpperCase()} has recommended a 10% inclusive scholarship for you.`;
      } else {
        welcomeText = `Welcome to the Educatory learning community!\nYou have been recommended for a 10% inclusive scholarship.`;
      }
      
      doc.fontSize(12)
         .font('Helvetica')
         .fillColor(colors.text)
         .text(welcomeText, margin, currentY, {
           width: usableWidth,
           align: 'left'
         });

      currentY += 40;

      // Your Exclusive Code (without box, centered alignment)
      doc.fontSize(14)
         .font('Helvetica-Bold')
         .fillColor(colors.dark)
         .text('Your Exclusive Scholarship Code:', margin, currentY, {
           width: usableWidth,
           align: 'center'
         });

      currentY += 25;

      // Code display (large, centered, no box)
      doc.fontSize(24)
         .fillColor(colors.primary)
         .font('Helvetica-Bold')
         .text(teacherData.referralCode, margin, currentY, {
           width: usableWidth,
           align: 'center'
         });

      currentY += 40;

      // Benefits section (in green)
      doc.fontSize(12)
         .font('Helvetica-Bold')
         .fillColor(colors.secondary)
         .text('Benefits: ', margin, currentY);

      doc.fontSize(12)
         .font('Helvetica')
         .fillColor(colors.secondary)
         .text('You can use this code to get an instant 10% scholarship on any course you enroll at Educatory.', 
               margin + 70, currentY, {
           width: usableWidth - 70,
           align: 'left'
         });

      currentY += 30;

      // Add one line space above Happy Learning
      currentY += 15;

      // Happy learning message
      doc.fontSize(12)
         .font('Helvetica')
         .fillColor(colors.text)
         .text('Happy Learning!', margin, currentY);

      currentY += 20;

      doc.fontSize(12)
         .font('Helvetica-Bold')
         .fillColor(colors.text)
         .text('Team Educatory', margin, currentY);

      currentY += 40;

      // === How To Enroll Section ===
      doc.fontSize(16)
         .font('Helvetica-Bold')
         .fillColor(colors.dark)
         .text('How To Enroll:', margin, currentY);

      currentY += 25;

      const enrollSteps = [
        '1. Visit: register.educatory.ac',
        '2. Click on "Enroll Now"',
        '3. Enter Basic Details & Click proceed.',
        `4. Then on next page, Enter Referral Code: ${teacherData.referralCode}`,
        '5. Instant 10% scholarship applied!'
      ];

      doc.fontSize(12)
         .font('Helvetica')
         .fillColor(colors.text);

      enrollSteps.forEach((step, index) => {
        if (step.includes('register.educatory.ac')) {
          // Split the step to handle the URL separately
          const parts = step.split('register.educatory.ac');
          doc.text(parts[0], margin, currentY + (index * 20));
          
          // Calculate position for the URL
          const beforeWidth = doc.widthOfString(parts[0]);
          
          doc.fillColor(colors.primary)
             .font('Helvetica-Bold')
             .text('register.educatory.ac', margin + beforeWidth, currentY + (index * 20), {
               link: 'https://register.educatory.ac',
               underline: true,
               width: usableWidth - beforeWidth
             });
          
          doc.fillColor(colors.text)
             .font('Helvetica');
        } else {
          doc.text(step, margin, currentY + (index * 20), {
            width: usableWidth
          });
        }
      });

      currentY += (6 * 20) + 20; // 6 steps + spacing

      // Note section
      doc.fontSize(11)
         .font('Helvetica-Bold')
         .fillColor(colors.accent)
         .text('Note: This scholarship code is valid for one-time use only.', margin, currentY, {
           width: usableWidth,
           align: 'left'
         });

      // === Enhanced Footer (Fixed at bottom) ===
      
      // Footer shadow
      doc.save();
      doc.opacity(0.2);
      doc.roundedRect(margin + 2, footerY + 2, usableWidth, footerHeight, 8)
         .fill(colors.dark);
      doc.restore();

      // Footer background
      doc.save();
      const footerGradient = doc.linearGradient(margin, footerY, margin, footerY + footerHeight);
      footerGradient.stop(0, colors.themeDark);
      footerGradient.stop(1, colors.themeLight);
      doc.roundedRect(margin, footerY, usableWidth, footerHeight, 8)
         .fill(footerGradient);
      doc.restore();

      doc.fontSize(10)
         .fillColor(colors.white)
         .font('Helvetica')
         .text('Need help? Contact us:', margin, footerY + 10, {
           align: 'center',
           width: usableWidth
         });

      doc.fontSize(11)
         .font('Helvetica-Bold')
         .fillColor(colors.goldLight)
         .text('support@educatory.ac', margin, footerY + 25, {
           align: 'center',
           width: usableWidth
         });

      // Copyright (fixed at very bottom)
      doc.fontSize(8)
         .fillColor(colors.textLight)
         .font('Helvetica')
         .text('© 2025 Educatory. All rights reserved.', margin, pageHeight-50, {
           align: 'center',
           width: usableWidth
         });

      doc.end();
      writeStream.on('finish', () => resolve(pdfPath));

    } catch (error) {
      reject(error);
    }
  });
};