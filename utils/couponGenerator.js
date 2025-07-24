const { createCanvas } = require('canvas');

exports.generateCouponCode = () => {
  const prefix = 'EDU';
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}${timestamp}${random}`;
};

exports.generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

exports.createCouponImage = async (couponCode, amount) => {
  const canvas = createCanvas(800, 400);
  const ctx = canvas.getContext('2d');

  // Create gradient background
  const gradient = ctx.createLinearGradient(0, 0, 800, 400);
  gradient.addColorStop(0, '#f6f8fe');
  gradient.addColorStop(1, '#e9efff');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 800, 400);

  // Add decorative border with pattern
  ctx.strokeStyle = '#2b4367';
  ctx.lineWidth = 3;
  ctx.setLineDash([15, 10]);
  ctx.strokeRect(20, 20, 760, 360);
  ctx.setLineDash([]);

  // Add logo/brand area
  ctx.fillStyle = '#2b4367';
  ctx.beginPath();
  ctx.roundRect(40, 40, 720, 60, 10);
  ctx.fill();

  // Add brand text
  ctx.font = 'bold 32px Arial';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText('EDUCATORY', 400, 82);

  // Add coupon title
  ctx.font = 'bold 28px Arial';
  ctx.fillStyle = '#2c3e50';
  ctx.fillText('Onetime Use Lifetime Coupon', 400, 140);

  // Add decorative divider
  ctx.strokeStyle = '#e74c3c';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(200, 160);
  ctx.lineTo(600, 160);
  ctx.stroke();

  // Add coupon code with background
  ctx.fillStyle = '#f8f9fa';
  ctx.beginPath();
  ctx.roundRect(250, 180, 300, 60, 10);
  ctx.fill();
  
  ctx.font = 'bold 36px "Courier New"';
  ctx.fillStyle = '#e74c3c';
  ctx.fillText(couponCode, 400, 222);

  // Add amount with special styling
  ctx.font = 'bold 48px Arial';
  ctx.fillStyle = '#27ae60';
  const amountText = `₹${amount}`;
  ctx.fillText(amountText, 400, 300);

  // Add decorative circles
  ctx.fillStyle = '#2b4367';
  ctx.beginPath();
  ctx.arc(20, 200, 20, 0, Math.PI * 2);
  ctx.arc(780, 200, 20, 0, Math.PI * 2);
  ctx.fill();

  // Add footer text
  ctx.font = '18px Arial';
  ctx.fillStyle = '#7f8c8d';
  ctx.fillText('Valid for one-time use on any course', 400, 350);

  // Add validity text
  ctx.font = 'italic 16px Arial';
  ctx.fillText('No Expiry | Terms & Conditions Apply', 400, 375);

  const buffer = canvas.toBuffer('image/png');
  const base64Image = buffer.toString('base64');

  return {
    buffer,
    base64Image
  };
};
