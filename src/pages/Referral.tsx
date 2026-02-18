import { useEffect, useState } from 'react';
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Users, Copy, Check, Gift } from 'lucide-react';
import { toast } from 'sonner';

interface ReferralHistory {
    id: string;
    referred_user_id: string;
    points_amount: number;
    type: string;
    created_at: string;
}

interface ReferralStats {
    referral_code: string;
    total_points: number;
    total_referrals: number;
    history: ReferralHistory[];
}

export default function Referral() {
    const [stats, setStats] = useState<ReferralStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        fetchStats();
    }, []);

    const fetchStats = async () => {
        try {
            const token = localStorage.getItem('auth_token') || localStorage.getItem('token');
            const res = await fetch('/api/referrals', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.status === 401) {
                localStorage.removeItem('auth_token');
                localStorage.removeItem('user_data');
                localStorage.removeItem('token');
                window.location.href = '/login';
                return;
            }
            if (res.ok) {
                const data = await res.json();
                setStats(data);
            }
        } catch (error) {
            console.error('Failed to fetch stats', error);
        } finally {
            setLoading(false);
        }
    };

    const copyToClipboard = () => {
        if (!stats?.referral_code) return;
        // Use /dashboard directly since /auth is bypassed
        const link = `${window.location.origin}/dashboard?ref=${stats.referral_code}`;
        navigator.clipboard.writeText(link);
        setCopied(true);
        toast.success('Referral link copied!');
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <AppLayout>
            <div className="space-y-6 p-4 md:p-8">
                <h2 className="text-3xl font-bold tracking-tight">Referral Program</h2>
                
                {/* Hero Section */}
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    <Card className="bg-primary text-primary-foreground">
                        <CardHeader>
                            <CardTitle className="text-2xl flex items-center gap-2">
                                <Gift className="h-6 w-6" />
                                {stats?.total_points || 0}
                            </CardTitle>
                            <CardDescription className="text-primary-foreground/80">Total Referral Points</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm opacity-90">Earn points for every friend you invite!</p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-2xl flex items-center gap-2">
                                <Users className="h-6 w-6" />
                                {stats?.total_referrals || 0}
                            </CardTitle>
                            <CardDescription>Total Friends Invited</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground">Keep growing your network.</p>
                        </CardContent>
                    </Card>

                    <Card className="md:col-span-2 lg:col-span-1">
                        <CardHeader>
                            <CardTitle>Your Referral Link</CardTitle>
                            <CardDescription>Share this link to earn points</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            <div className="flex gap-2">
                                <Input 
                                    readOnly 
                                    value={stats?.referral_code ? `${window.location.origin}/dashboard?ref=${stats.referral_code}` : 'Loading...'} 
                                    className="font-mono text-xs"
                                />
                                <Button size="icon" onClick={copyToClipboard} variant="outline">
                                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* History Section */}
                <Card>
                    <CardHeader>
                        <CardTitle>Referral History</CardTitle>
                        <CardDescription>Recent activity and rewards</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <p className="text-sm text-muted-foreground">Loading...</p>
                        ) : stats?.history && stats.history.length > 0 ? (
                            <div className="space-y-4">
                                {stats.history.map((item) => (
                                    <div key={item.id} className="flex justify-between items-center border-b pb-2 last:border-0">
                                        <div>
                                            <p className="font-medium">{item.type.replace('_', ' ').toUpperCase()}</p>
                                            <p className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleDateString()}</p>
                                        </div>
                                        <div className="text-green-600 font-bold">
                                            +{item.points_amount} pts
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-sm text-muted-foreground">No referrals yet. Start inviting!</p>
                        )}
                    </CardContent>
                </Card>

            </div>
        </AppLayout>
    );
}
