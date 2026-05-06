import { useState, useEffect } from 'react';
import { AlertTriangle, Phone, Video, Clock, Check, X } from 'lucide-react';
import { fetchEscalations, resolveEscalation, type Escalation } from '../api/client';

export default function EscalationQueue() {
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadEscalations();
    // Auto-refresh every 10 seconds
    const interval = setInterval(loadEscalations, 10000);
    return () => clearInterval(interval);
  }, []);

  async function loadEscalations() {
    try {
      setLoading(true);
      const data = await fetchEscalations();
      setEscalations(data);
      setError(null);
    } catch (err) {
      console.error('Failed to load escalations:', err);
      setError('Failed to connect to backend.');
      setEscalations([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleResolve(escalationId: string) {
    try {
      await resolveEscalation(escalationId, 'Resolved by coordinator');
      await loadEscalations();
    } catch (err) {
      console.error('Failed to resolve escalation:', err);
      alert('Failed to resolve escalation');
    }
  }

  function formatTimeAgo(isoString: string): string {
    const now = Date.now();
    const then = new Date(isoString).getTime();
    const diffMs = now - then;
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 60) return `${diffMins} minutes ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} hours ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} days ago`;
  }

  const tierClass = (tier: string) => tier === 'RED' ? 'red' : 'orange';

  if (loading) {
    return (
      <div className="animate-in" style={{ textAlign: 'center', padding: '60px 20px' }}>
        <div style={{ fontSize: '1.2rem', color: 'var(--text-secondary)' }}>Loading escalations...</div>
      </div>
    );
  }

  const redCount = escalations.filter(e => e.tier === 'RED').length;
  const orangeCount = escalations.filter(e => e.tier === 'ORANGE').length;

  return (
    <div className="animate-in">
      {error && (
        <div style={{ 
          padding: '12px 16px', 
          background: 'var(--orange-bg)', 
          border: '1px solid var(--orange)', 
          borderRadius: 'var(--radius-sm)', 
          marginBottom: '16px',
          fontSize: '0.85rem',
          color: 'var(--orange)'
        }}>
          ⚠️ {error}
        </div>
      )}

      <div className="page-header">
        <h2>Escalation Queue</h2>
        <p>{escalations.length} escalations requiring attention</p>
      </div>

      {/* Summary */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
        <div className="stat-card" style={{ flex: 1, borderLeft: '3px solid var(--red)' }}>
          <div className="stat-label">RED — Critical</div>
          <div className="stat-value" style={{ color: 'var(--red)', fontSize: '2.5rem' }}>{redCount}</div>
        </div>
        <div className="stat-card" style={{ flex: 1, borderLeft: '3px solid var(--orange)' }}>
          <div className="stat-label">ORANGE — Moderate</div>
          <div className="stat-value" style={{ color: 'var(--orange)', fontSize: '2.5rem' }}>{orangeCount}</div>
        </div>
        <div className="stat-card" style={{ flex: 1, borderLeft: '3px solid var(--green)' }}>
          <div className="stat-label">Resolved Today</div>
          <div className="stat-value" style={{ color: 'var(--green)', fontSize: '2.5rem' }}>5</div>
        </div>
      </div>

      {/* Escalation Cards */}
      {escalations.map(esc => (
        <div key={esc.escalation_id} className={`card animate-slide`} style={{ marginBottom: 16, borderLeft: `4px solid var(--${tierClass(esc.tier)})` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <AlertTriangle size={18} color={esc.tier === 'RED' ? '#ef4444' : '#f59e0b'} />
                <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>{esc.patient_name || 'Unknown Patient'}</h3>
                <span className={`risk-badge ${tierClass(esc.tier)}`}>{esc.tier}</span>
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>ABHA: {esc.patient_abha_id}</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-muted)', fontSize: '0.75rem' }}>
              <Clock size={14} /> {formatTimeAgo(esc.created_at)}
            </div>
          </div>

          {/* Trigger Reason */}
          <div style={{ background: 'var(--bg-primary)', padding: 14, borderRadius: 'var(--radius-sm)', marginBottom: 12 }}>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              <strong style={{ color: 'var(--text-primary)' }}>Trigger:</strong> {esc.trigger_reason}
            </p>
          </div>

          {/* SHAP Explanation */}
          <div style={{ background: 'rgba(99, 102, 241, 0.06)', padding: 14, borderRadius: 'var(--radius-sm)', marginBottom: 12, border: '1px solid rgba(99, 102, 241, 0.1)' }}>
            <p style={{ fontSize: '0.75rem', color: 'var(--accent-indigo)', fontWeight: 600, marginBottom: 4 }}>🧠 AI Risk Factors (SHAP)</p>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{esc.shap_explanation}</p>
          </div>

          {/* Recommended Action */}
          <div style={{ background: `var(--${tierClass(esc.tier)}-bg)`, padding: 14, borderRadius: 'var(--radius-sm)', marginBottom: 16 }}>
            <p style={{ fontSize: '0.8rem', color: `var(--${tierClass(esc.tier)})`, lineHeight: 1.5 }}>
              <strong>Recommended:</strong> {esc.recommended_action}
            </p>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary"><Video size={14} /> Book Teleconsult</button>
            <button className="btn btn-outline"><Phone size={14} /> Call Patient</button>
            <button className="btn btn-outline" onClick={() => handleResolve(esc.escalation_id)}>
              <Check size={14} /> Resolve
            </button>
            {esc.tier === 'RED' && (
              <button className="btn btn-danger">🚑 Dispatch 108</button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
