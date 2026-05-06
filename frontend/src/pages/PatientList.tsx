import { useState, useEffect } from 'react';
import { Search, Filter, ChevronRight } from 'lucide-react';
import { fetchPatients, type PatientListItem } from '../api/client';

export default function PatientList() {
  const [patients, setPatients] = useState<PatientListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    loadPatients();
    // Auto-refresh every 10 seconds
    const interval = setInterval(loadPatients, 10000);
    return () => clearInterval(interval);
  }, [page]);

  async function loadPatients() {
    try {
      setLoading(true);
      const data = await fetchPatients(page, 50);
      setPatients(data.patients);
      setTotal(data.total);
      setError(null);
    } catch (err) {
      console.error('Failed to load patients:', err);
      setError('Failed to connect to backend.');
      setPatients([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }

  const filtered = patients.filter(p => {
    if (filter !== 'ALL' && p.risk_tier !== filter) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase()) && !p.abha_id.includes(search)) return false;
    return true;
  });

  const tierClass = (tier: string) => tier === 'GREEN' ? 'green' : tier === 'ORANGE' ? 'orange' : 'red';

  if (loading) {
    return (
      <div className="animate-in" style={{ textAlign: 'center', padding: '60px 20px' }}>
        <div style={{ fontSize: '1.2rem', color: 'var(--text-secondary)' }}>Loading patients...</div>
      </div>
    );
  }

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
        <h2>Active Patients</h2>
        <p>{total} patients in 30-day post-discharge monitoring</p>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 240, position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Search by name or ABHA ID..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%', padding: '10px 12px 10px 36px',
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)',
              fontSize: '0.875rem', outline: 'none',
            }}
          />
        </div>
        {['ALL', 'GREEN', 'ORANGE', 'RED'].map(tier => (
          <button
            key={tier}
            onClick={() => setFilter(tier)}
            className={`btn ${filter === tier ? 'btn-primary' : 'btn-outline'}`}
          >
            {tier === 'ALL' ? 'All' : tier === 'GREEN' ? '🟢 Green' : tier === 'ORANGE' ? '🟠 Orange' : '🔴 Red'}
          </button>
        ))}
      </div>

      {/* Patient Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Patient</th>
              <th>Diagnosis</th>
              <th>Day</th>
              <th>Risk Score</th>
              <th>Adherence</th>
              <th>Last Contact</th>
              <th>Next Action</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => (
              <tr key={p.abha_id}>
                <td>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{p.name}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{p.abha_id}</div>
                </td>
                <td>{p.diagnosis}</td>
                <td>
                  <span style={{ fontWeight: 600 }}>{p.current_day}</span>/30
                  <div className="progress-bar" style={{ width: 60, marginTop: 4 }}>
                    <div className={`progress-fill ${tierClass(p.risk_tier)}`} style={{ width: `${(p.current_day / 30) * 100}%` }} />
                  </div>
                </td>
                <td>
                  <span className={`risk-badge ${tierClass(p.risk_tier)}`}>
                    {p.risk_score.toFixed(2)} {p.risk_tier}
                  </span>
                </td>
                <td>
                  <span style={{ fontWeight: 600 }}>{p.med_adherence_streak}d</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}> streak</span>
                </td>
                <td>
                  <div>{p.last_contact}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{p.last_contact_channel}</div>
                </td>
                <td style={{ fontSize: '0.8rem' }}>{p.next_action}</td>
                <td><ChevronRight size={16} color="var(--text-muted)" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
