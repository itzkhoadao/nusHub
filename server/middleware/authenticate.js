const jwt = require("jsonwebtoken");

module.exports = function authenticate(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; // take the token from the request

  if (!token) {
    // user is not logged in
    return res.status(401).json({ error: "No token provided. Please log in." });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next(); // authentication passed, move on to the actual route
  } catch (err) {
    return res
      .status(401)
      .json({ error: "Invalid token. Please log in again." });
  }
};
