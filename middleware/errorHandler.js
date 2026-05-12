// middleware/errorHandler.js
module.exports = function errorHandler(err, req, res, _next) {
  // Print full error to backend terminal so you can see exactly what went wrong
  console.error("─────────────────────────────────────────");
  console.error(`❌ ERROR  ${req.method} ${req.originalUrl}`);
  console.error("Message :", err.message);
  console.error("Code    :", err.code || "—");
  console.error("Stack   :", err.stack);
  console.error("─────────────────────────────────────────");

  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    success: false,
    message: err.message || "Internal server error.",
    // show error code in dev so the frontend can display useful info
    ...(process.env.NODE_ENV !== "production" && { code: err.code }),
  });
};
