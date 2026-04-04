import { OAuth2Client } from 'google-auth-library';
import supabase from '../utils/supabase.js';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export class AuthService {
  static async verifyGoogleToken(idToken: string) {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    return ticket.getPayload();
  }

  static async findUserByEmail(email: string) {
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .maybeSingle(); // maybeSingle doesn't throw on no rows returned
    
    if (error) throw error;
    return user || null;
  }

  static async findUserById(id: string) {
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    return user || null;
  }

  static async hashPassword(password: string) {
    return bcrypt.hash(password, 10);
  }

  static async checkPassword(password: string, hash: string) {
    return bcrypt.compare(password, hash);
  }

  static generateVerificationToken() {
    return uuidv4();
  }

  static generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }
}
