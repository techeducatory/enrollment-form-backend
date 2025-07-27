const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const generateEnrollmentPDF = async (data) => {
  return new Promise((resolve, reject) => {
    try {
      // Track total pages
      let buffers = [];
      const doc = new PDFDocument({
        margins: { top: 50, bottom: 70, left: 50, right: 50 }, // Increased bottom margin for footer
        size: 'A4',
        bufferPages: true // Enable page buffering
      });

      // Collect PDF buffers
      doc.on('data', buffers.push.bind(buffers));

      const fileName = `enrollment-${data.enrollment_id}.pdf`;
      // Create enrollment-forms directory if it doesn't exist
      const enrollmentFormsDir = path.join(__dirname, '../enrollment-forms');
      if (!fs.existsSync(enrollmentFormsDir)) {
        fs.mkdirSync(enrollmentFormsDir, { recursive: true });
      }

      const filePath = path.join(enrollmentFormsDir, fileName);

      // Define reusable styles
      const styles = {
        header: { fontSize: 24, color: '#1a237e' },
        sectionTitle: { fontSize: 14, color: '#1a237e' },
        normal: { fontSize: 10, color: '#000000' },
        tableHeader: { fontSize: 10, color: '#ffffff', backgroundColor: '#1a237e' },
        tableRow: { fontSize: 10, color: '#000000' },
        footer: { fontSize: 8, color: '#666666' }
      };

      // Add header
      doc.image(path.join(__dirname, '../assets/educatory-logo.jpg'), 50, 30, { width: 150 })
         .font('Helvetica-Bold')
         .fontSize(styles.header.fontSize)
         .fillColor(styles.header.color)
         .text('Registration Details', 170, 50, { align: 'right' });

      // Add horizontal line under header
      doc.moveTo(50, 90)
         .lineTo(545, 90)
         .strokeColor('#1a237e')
         .stroke();

      // Start content area
      doc.y = 120;

      // Create sections with proper spacing and styling
      const createSection = (title, data) => {
        // Check if we need a new page
        if (doc.y > doc.page.height - 150) {
          doc.addPage();
        }

        // Section title
        doc.font('Helvetica-Bold')
           .fontSize(styles.sectionTitle.fontSize)
           .fillColor(styles.sectionTitle.color)
           .text(title, 50, doc.y);

        doc.moveDown(0.5);

        // Create table
        createTable(doc, data);
        doc.moveDown(1);

        // Add separator line after section
        doc.moveTo(50, doc.y)
           .lineTo(545, doc.y)
           .strokeColor('#e0e0e0')
           .stroke();
        
        doc.moveDown(1);
      };

      // Course & Payment Details Section
      // Registration Information section with extra spacing and no border/background
      doc.moveDown(1.5);
      doc.font('Helvetica-Bold')
         .fontSize(styles.sectionTitle.fontSize)
         .fillColor(styles.sectionTitle.color)
         .text('Registration Information', 50, doc.y);
      doc.moveDown(0.7);
      doc.font('Helvetica-Bold')
         .fontSize(12)
         .fillColor('#000000')
         .text('Registration ID / Enrollment ID / Roll No.: ', 50, doc.y, {
           continued: true,
           align: 'left'
         })
         .font('Helvetica')
         .text(data.enrollment_id);
      doc.moveDown(1.5);

      // Course & Payment Details Section
      createSection('Course Details', [
        ['Course Name', data.course_name],
        ['Course ID', data.course_id],
        ['Course Fee', 'Rs. ' + data.course_fee],
        ['Discount', 'Rs. ' + ((data.course_fee - data.payment_amount) || 0)],
        ['Net Course Fee', 'Rs. ' + (data.payment_amount || data.course_fee)],
        ['Amount Paid', 'Rs. ' + (data.payment_amount || data.course_fee)],
        ['Payment ID', data.payment_id || 'N/A'],
        ['Payment Status', data.enrollment_status === 'completed' ? 'Completed' : 'Pending'],
        ['Payment Date', data.payment_date ? new Date(data.payment_date).toLocaleDateString('en-IN') : 'N/A'],
      ]);

      // Personal Details Section
      createSection('Personal Details', [
        ['Name', `${data.first_name} ${data.last_name}`],
        ['Email', data.email],
        ['Phone', data.phone],
        ['Aadhar Number', data.aadhar_number],
        ['Address', `${data.address}, ${data.city}, ${data.district}, ${data.state} - ${data.pin_code}`]
      ]);

      // School Details
      createSection('School Details', [
        ['School Name', data.school_name || 'N/A'],
        ['School Address', data.school_city ? `${data.school_city}, ${data.school_district}, ${data.school_state} - ${data.school_pin_code}` : 'N/A']
      ]);

      // Parent Details
      createSection('Parent Details', [
        ['Father\'s Name', data.father_name || 'N/A'],
        ['Father\'s Occupation', data.father_occupation || 'N/A'],
        ['Father\'s Contact', data.father_phone ? `${data.father_phone}\n${data.father_email || ''}` : 'N/A'],
        ['Father\'s Address', data.father_address ? `${data.father_address}, ${data.father_city}, ${data.father_district}, ${data.father_state} - ${data.father_pin_code}` : 'N/A'],
        ['Mother\'s Name', data.mother_name || 'N/A'],
        ['Mother\'s Occupation', data.mother_occupation || 'N/A'],
        ['Mother\'s Contact', data.mother_phone ? `${data.mother_phone}\n${data.mother_email || ''}` : 'N/A'],
        ['Mother\'s Address', data.mother_address ? `${data.mother_address}, ${data.mother_city}, ${data.mother_district}, ${data.mother_state} - ${data.mother_pin_code}` : 'N/A']
      ]);

      // Add footer to all pages
      const addFooter = () => {
        const totalPages = doc.bufferedPageRange().count;
        
        for (let i = 0; i < totalPages; i++) {
          doc.switchToPage(i);
          
          // Save current y position
          const originalY = doc.y;
          
          // Move to footer position
          doc.page.margins.bottom = 0;
          
          doc.fontSize(8)
             .fillColor('#666666')
             .text(
               `Page ${i + 1} of ${totalPages}`,
               0,
               doc.page.height - 40,
               { align: 'center' }
             )
             .text(
               'This is a computer-generated document',
               0,
               doc.page.height - 25,
               { align: 'center' }
             );
          
          // Restore margins and position
          doc.page.margins.bottom = 70;
          doc.y = originalY;
        }
      };

      // Finalize the PDF
      doc.on('end', () => {
        // Get the PDF buffer
        const pdfBuffer = Buffer.concat(buffers);
        
        // Write to file
        fs.writeFile(filePath, pdfBuffer, (err) => {
          if (err) {
            reject(err);
          } else {
            resolve(filePath);
          }
        });
      });

      // Add footer and end document
      addFooter();
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

const createTable = (doc, data) => {
  const startX = 50;
  const startY = doc.y;
  const cellPadding = 8;
  const labelWidth = 150;
  const valueWidth = 345;
  
  let currentY = startY;

  // Calculate row heights and draw table
  data.forEach((row, i) => {
    // Get height for both label and value columns
    const labelHeight = doc.heightOfString(row[0], {
      width: labelWidth - (cellPadding * 2)
    });
    
    const valueHeight = doc.heightOfString(row[1], {
      width: valueWidth - (cellPadding * 2)
    });
    
    // Use the taller height for the row
    const rowHeight = Math.max(labelHeight, valueHeight) + (cellPadding * 2);

    // Check if we need a new page
    if (currentY + rowHeight > doc.page.height - 100) {
      doc.addPage();
      currentY = doc.page.margins.top;
    }

    // Row background
    doc.rect(startX, currentY, labelWidth + valueWidth, rowHeight)
       .fill(i % 2 === 0 ? '#f8f9fa' : '#ffffff');
    
    // Cell borders
    doc.strokeColor('#e0e0e0')
       .rect(startX, currentY, labelWidth + valueWidth, rowHeight)
       .stroke();
    doc.rect(startX + labelWidth, currentY, 0, rowHeight)
       .stroke();

    // Label (left column)
    doc.font('Helvetica-Bold')
       .fontSize(10)
       .fillColor('#000000')
       .text(
         row[0],
         startX + cellPadding,
         currentY + cellPadding,
         {
           width: labelWidth - (cellPadding * 2),
           align: 'left'
         }
       );

    // Value (right column)
    doc.font('Helvetica')
       .text(
         row[1],
         startX + labelWidth + cellPadding,
         currentY + cellPadding,
         {
           width: valueWidth - (cellPadding * 2),
           align: 'left'
         }
       );

    // Update Y position for next row
    currentY += rowHeight;
  });

  // Update document Y position
  doc.y = currentY + 10;
  return doc;
};

module.exports = { generateEnrollmentPDF };
