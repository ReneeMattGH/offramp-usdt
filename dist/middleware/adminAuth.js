import jwt from 'jsonwebtoken';
import supabase from '../utils/supabase.js';
import config from '../config/index.js';
export const adminAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ message: 'Unauthorized' });
        }
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, config.jwtSecret);
        const { data: admin, error } = await supabase
            .from('admins')
            .select('id, username, role')
            .eq('id', decoded.id)
            .maybeSingle();
        if (error || !admin) {
            return res.status(401).json({ message: 'Unauthorized' });
        }
        req.admin = admin;
        next();
    }
    catch (err) {
        res.status(401).json({ message: 'Invalid session' });
    }
};
//# sourceMappingURL=adminAuth.js.map