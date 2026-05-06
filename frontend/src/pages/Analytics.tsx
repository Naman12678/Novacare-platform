import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend } from 'recharts';
import { fetchAnalyticsTrend, type AnalyticsTrend } from '../api/client';

export default function Analytics() {
  const [analytics, setAnalytics] = useState<AnalyticsTrend[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAnalytics();
  }, []);

  async function loadAnalytics() {
    try {
      setLoading(true);
      const data = await fetchAnalyticsTrend(30);
      setAnalytics(data);
      setError(null);
    } catch (err) {
      console.error('Failed to load analytics:', err);
      setError('Failed to load analytics. Using demo data.');
    } finally {
      setLoading(false);
    }
  }

  // Transform data for charts
  const readmissionData = analytics.length > 0
    ? analytics.slice(-4).map((a, i) => ({
        week: `W${i + 1}`,
        prevented: Math.max(0, Math.floor((1 - a.readmission_rate / 100) * 10)),
        readmitted: Math.floor(a.readmission_rate / 100 * 10),
      }))
    : [
        { week: 'W1', prevented: 3, readmitted: 1 },
        { week: 'W2', prevented: 5, readmitted: 0 },
        { week: 'W3', prevented: 4, readmitted: 1 },
        { week: 'W4', prevented: 7, readmitted: 0 },
      ];

  const diagnosisData = [
    { name: 'Heart Failure', value: 35, color: '#ef4444' },
    { name: 'Diabetes', value: 28, color: '#f59e0b' },
    { name: 'COPD', value: 18, color: '#06b6d4' },
    { name: 'CKD', value: 12, color: '#8b5cf6' },
    { name: 'Post-Surgery', value: 7, color: '#10b981' },
  ];

  const escalationTriggers = [
    { trigger: 'Symptom worsening', count: 28, pct: 35 },
    { trigger: 'Medication non-adherence', count: 22, pct: 27 },
    { trigger: 'Missed check-ins', count: 16, pct: 20 },
    { trigger: 'Lab results critical', count: 8, pct: 10 },
    { trigger: 'Caregiver report', count: 6, pct: 8 },
  ];

  const adherenceByDiagnosis = [
    { diagnosis: 'HF', rate: 78 },
    { diagnosis: 'Diabetes', rate: 85 },
    { diagnosis: 'COPD', rate: 72 },
    { diagnosis: 'CKD', rate: 80 },
    { diagnosis: 'Post-Sx', rate: 91 },
  ];

  const tooltipStyle = {
    background: '#1a1f35',
    border: '1px solid rgba(148,163,184,0.1)',
    borderRadius: '8px',
    color: '#f1f5f9',
  };

  // Calculate KPIs from analytics
  const totalPatients = analytics.length > 0 ? analytics[analytics.length - 1].active_patients : 124;
  const avgReadmissionRate = analytics.length > 0
    ? (analytics.reduce((sum, a) => sum + a.readmission_rate, 0) / analytics.length).toFixed(1)
    : '4.2';
  const totalTeleconsults = analytics.length > 0
    ? analytics.reduce((sum, a) => sum + a.teleconsults_booked, 0)
    : 67;
  const teleconsultAttendance = analytics.length > 0 && totalTeleconsults > 0
    ? Math.round((analytics.reduce((sum, a) => sum + a.teleconsults_attended, 0) / totalTeleconsults) * 100)
    : 83;

  if (loading) {
    return (
      <div className="animate-in" style={{ textAlign: 'center', padding: '60px 20px' }}>
        <div style={{ fontSize: '1.2rem', color: 'var(--text-secondary)' }}>Loading analytics...</div>
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
        <h2>Analytics & Reports</h2>
        <p>Hospital-level insights — Last 30 days</p>
      </div>

      {/* KPI Row */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Episodes Completed</div>
          <div className="stat-value" style={{ color: '#10b981' }}>{totalPatients}</div>
          <div className="stat-change positive">92% completion rate</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Readmissions Prevented</div>
          <div className="stat-value" style={{ color: '#06b6d4' }}>19</div>
          <div className="stat-change positive">₹7.6L saved</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Teleconsults Booked</div>
          <div className="stat-value" style={{ color: '#8b5cf6' }}>{totalTeleconsults}</div>
          <div className="stat-change positive">{teleconsultAttendance}% attended</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Pharmacy Refills</div>
          <div className="stat-value" style={{ color: '#f59e0b' }}>48</div>
          <div className="stat-change positive">31 via Jan Aushadhi</div>
        </div>
      </div>

      <div className="charts-grid">
        {/* Readmission Prevention */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Readmission Prevention — Weekly</span>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={readmissionData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="week" stroke="#64748b" fontSize={12} />
              <YAxis stroke="#64748b" fontSize={12} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend />
              <Bar dataKey="prevented" name="Prevented" fill="#10b981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="readmitted" name="Readmitted" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Diagnosis Distribution */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Patient by Diagnosis</span>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={diagnosisData} cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={4} dataKey="value">
                {diagnosisData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
            {diagnosisData.map(d => (
              <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: d.color }} />
                {d.name} ({d.value}%)
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Escalation Triggers */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <span className="card-title">Top Escalation Triggers</span>
        </div>
        {escalationTriggers.map(t => (
          <div key={t.trigger} style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12 }}>
            <span style={{ width: 180, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t.trigger}</span>
            <div className="progress-bar" style={{ flex: 1, height: 8 }}>
              <div className="progress-fill orange" style={{ width: `${t.pct}%`, background: 'linear-gradient(90deg, #6366f1, #8b5cf6)' }} />
            </div>
            <span style={{ width: 50, fontSize: '0.8rem', fontWeight: 600, textAlign: 'right' }}>{t.count}</span>
          </div>
        ))}
      </div>

      {/* Adherence by Diagnosis */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Medication Adherence by Diagnosis Category</span>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={adherenceByDiagnosis} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis type="number" domain={[0, 100]} stroke="#64748b" fontSize={11} />
            <YAxis type="category" dataKey="diagnosis" stroke="#64748b" fontSize={12} />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="rate" name="Adherence %" fill="#06b6d4" radius={[0, 4, 4, 0]} barSize={20} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
