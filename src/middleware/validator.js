const VALID_METHODS = ['UPI', 'CARD', 'NETBANKING', 'WALLET'];
const MAX_AMOUNT = 1_000_000; // ₹10,00,000
const MIN_AMOUNT = 1;         // ₹1

const validatePaymentRequest = (req, res, next) => {
  const { userId, amount, method } = req.body;
  const errors = [];

  if (!userId || typeof userId !== 'string' || userId.trim() === '') {
    errors.push('userId is required and must be a non-empty string');
  }

  if (amount === undefined || amount === null) {
    errors.push('amount is required');
  } else if (typeof amount !== 'number' || isNaN(amount)) {
    errors.push('amount must be a number');
  } else if (amount < MIN_AMOUNT) {
    errors.push(`amount must be at least ₹${MIN_AMOUNT}`);
  } else if (amount > MAX_AMOUNT) {
    errors.push(`amount cannot exceed ₹${MAX_AMOUNT}`);
  }

  if (!method) {
    errors.push('method is required');
  } else if (!VALID_METHODS.includes(method.toUpperCase())) {
    errors.push(`method must be one of: ${VALID_METHODS.join(', ')}`);
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      errors,
    });
  }

  // Normalize
  req.body.method = method.toUpperCase();
  req.body.userId = userId.trim();
  req.body.amount = parseFloat(amount.toFixed(2));

  next();
};

module.exports = { validatePaymentRequest };
