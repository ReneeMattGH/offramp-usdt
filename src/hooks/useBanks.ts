import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface Bank {
  id: string;
  name: string;
  code: string;
  logo_url: string | null;
  is_active: boolean;
  processing_time: string;
}

export function useBanks() {
  const [banks, setBanks] = useState<Bank[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchBanks = async () => {
      setIsLoading(true);
      
      try {
        const { data, error } = await supabase
          .from('banks')
          .select('*')
          .eq('is_active', true)
          .order('name');

        if (error) throw error;
        setBanks(data || []);
      } catch (err) {
        console.error('Error fetching banks:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchBanks();
  }, []);

  return { banks, isLoading };
}
