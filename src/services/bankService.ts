import supabase from '../utils/supabase.js';

export class BankService {
  async addBankAccount(userId: string, data: {
    account_number: string;
    ifsc_code: string;
    account_holder_name: string;
    bank_name: string;
    is_primary?: boolean;
  }) {
    // If this is the first bank account, make it primary
    const { count } = await supabase
      .from('bank_accounts')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .is('deleted_at', null);

    const isPrimary = count === 0 ? true : (data.is_primary || false);

    // If setting as primary, unset others
    if (isPrimary) {
      await supabase
        .from('bank_accounts')
        .update({ is_primary: false })
        .eq('user_id', userId)
        .is('deleted_at', null);
    }

    const { data: account, error } = await supabase
      .from('bank_accounts')
      .insert({
        user_id: userId,
        account_number: data.account_number,
        ifsc_code: data.ifsc_code,
        account_holder_name: data.account_holder_name,
        bank_name: data.bank_name,
        is_primary: isPrimary
      })
      .select()
      .single();

    if (error) throw error;
    return account;
  }

  async listUserBankAccounts(userId: string) {
    const { data, error } = await supabase
      .from('bank_accounts')
      .select('*')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('is_primary', { ascending: false });

    if (error) throw error;
    return data;
  }

  async listAllBankAccounts() {
    const { data, error } = await supabase
      .from('bank_accounts')
      .select(`
        *,
        user:users (
          id,
          phone_number,
          account_holder_name
        )
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }

  async updateBankAccount(accountId: string, data: any) {
    const { data: account, error } = await supabase
      .from('bank_accounts')
      .update({
        ...data,
        updated_at: new Date().toISOString()
      })
      .eq('id', accountId)
      .select()
      .single();

    if (error) throw error;
    return account;
  }

  async deleteBankAccount(accountId: string, userId?: string) {
    // Soft delete by setting deleted_at timestamp
    // Supabase builder is immutable — chain conditionally by building the full expression
    let baseQuery = supabase
      .from('bank_accounts')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', accountId)
      .is('deleted_at', null);

    const { error } = userId
      ? await baseQuery.eq('user_id', userId)
      : await baseQuery;

    if (error) throw error;
    return true;
  }
}

export default new BankService();
