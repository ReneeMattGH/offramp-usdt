import jwt from 'jsonwebtoken';
import config from '../config/index.js';
export const authenticate = (req, res, next) => {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) {
        return res.status(401).json({ message: 'No token provided' });
    }
    try {
        const decoded = jwt.verify(token, config.jwtSecret);
        req.user = { id: decoded.id };
        next();
    }
    catch (error) {
        return res.status(401).json({ message: 'Invalid or expired token' });
    }
};
//# sourceMappingURL=authMiddleware.js.map