import { useState, type FormEvent } from 'react';
import { UserPlus, ArrowLeft, CheckCircle, AlertCircle } from 'lucide-react';
import { registerPatient } from '../api/client';
import { useNavigate } from 'react-router-dom';

export default function RegisterPatient() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [form, setForm] = useState({
    abhaId: '',
    name: '',
    dateOfBirth: '',
    gender: '',
    contactPhone: '',
    pincode: '',
    languagePref: 'en',
    caregiverName: '',
    caregiverPhone: '',
    caregiverRelationship: '',
  });

  function updateField(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      const result = await registerPatient({
        abhaId: form.abhaId,
        name: form.name,
        dateOfBirth: form.dateOfBirth,
        gender: form.gender,
        contactPhone: form.contactPhone,
        pincode: form.pincode,
        languagePref: form.languagePref,
        hospitalId: 'demo-hospital-001',
        caregiverName: form.caregiverName || undefined,
        caregiverPhone: form.caregiverPhone || undefined,
        caregiverRelationship: form.caregiverRelationship || undefined,
      });
      setSuccess(`Patient registered successfully! Episode ID: ${result.episodeId}`);
      // Reset form
      setForm({
        abhaId: '',
        name: '',
        dateOfBirth: '',
        gender: '',
        contactPhone: '',
        pincode: '',
        languagePref: 'en',
        caregiverName: '',
        caregiverPhone: '',
        caregiverRelationship: '',
      });
    } catch (err: any) {
      setError(err.message || 'Failed to register patient. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const inputStyle = {
    width: '100%',
    padding: '10px 14px',
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-primary)',
    fontSize: '0.875rem',
    outline: 'none',
  };

  const labelStyle = {
    display: 'block',
    fontSize: '0.8rem',
    fontWeight: 600 as const,
    color: 'var(--text-secondary)',
    marginBottom: '6px',
  };

  const fieldGroup = {
    marginBottom: '16px',
  };

  return (
    <div className="animate-in">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
          <button
            onClick={() => navigate('/patients')}
            className="btn btn-outline"
            style={{ padding: '6px 10px' }}
          >
            <ArrowLeft size={16} />
          </button>
          <h2>Register New Patient</h2>
        </div>
        <p>Add a new patient to the post-discharge monitoring program</p>
      </div>

      {error && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '12px 16px',
          background: 'var(--red-bg)',
          border: '1px solid rgba(239, 68, 68, 0.2)',
          borderRadius: 'var(--radius-sm)',
          marginBottom: '20px',
          fontSize: '0.85rem',
          color: 'var(--red)',
        }}>
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {success && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '12px 16px',
          background: 'var(--green-bg)',
          border: '1px solid rgba(16, 185, 129, 0.2)',
          borderRadius: 'var(--radius-sm)',
          marginBottom: '20px',
          fontSize: '0.85rem',
          color: 'var(--green)',
        }}>
          <CheckCircle size={16} />
          {success}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="card" style={{ marginBottom: '24px' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '20px', color: 'var(--text-primary)' }}>
            Patient Information
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div style={fieldGroup}>
              <label style={labelStyle}>ABHA ID *</label>
              <input
                type="text"
                value={form.abhaId}
                onChange={e => updateField('abhaId', e.target.value)}
                placeholder="XX-XXXX-XXXX-XXXX"
                required
                style={inputStyle}
              />
            </div>

            <div style={fieldGroup}>
              <label style={labelStyle}>Patient Name *</label>
              <input
                type="text"
                value={form.name}
                onChange={e => updateField('name', e.target.value)}
                placeholder="Full name"
                required
                style={inputStyle}
              />
            </div>

            <div style={fieldGroup}>
              <label style={labelStyle}>Date of Birth *</label>
              <input
                type="date"
                value={form.dateOfBirth}
                onChange={e => updateField('dateOfBirth', e.target.value)}
                required
                style={inputStyle}
              />
            </div>

            <div style={fieldGroup}>
              <label style={labelStyle}>Gender *</label>
              <select
                value={form.gender}
                onChange={e => updateField('gender', e.target.value)}
                required
                style={inputStyle}
              >
                <option value="">Select gender</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div style={fieldGroup}>
              <label style={labelStyle}>Phone Number (with country code) *</label>
              <input
                type="tel"
                value={form.contactPhone}
                onChange={e => updateField('contactPhone', e.target.value)}
                placeholder="919876543210"
                required
                style={inputStyle}
              />
            </div>

            <div style={fieldGroup}>
              <label style={labelStyle}>Pincode *</label>
              <input
                type="text"
                value={form.pincode}
                onChange={e => updateField('pincode', e.target.value)}
                placeholder="110001"
                required
                maxLength={6}
                style={inputStyle}
              />
            </div>

            <div style={fieldGroup}>
              <label style={labelStyle}>Language Preference *</label>
              <select
                value={form.languagePref}
                onChange={e => updateField('languagePref', e.target.value)}
                required
                style={inputStyle}
              >
                <option value="en">English</option>
                <option value="hi">Hindi</option>
                <option value="mr">Marathi</option>
                <option value="ta">Tamil</option>
                <option value="te">Telugu</option>
                <option value="bn">Bengali</option>
              </select>
            </div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: '24px' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '20px', color: 'var(--text-primary)' }}>
            Caregiver / Family Member
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div style={fieldGroup}>
              <label style={labelStyle}>Caregiver Name</label>
              <input
                type="text"
                value={form.caregiverName}
                onChange={e => updateField('caregiverName', e.target.value)}
                placeholder="Family member name"
                style={inputStyle}
              />
            </div>

            <div style={fieldGroup}>
              <label style={labelStyle}>Caregiver Phone</label>
              <input
                type="tel"
                value={form.caregiverPhone}
                onChange={e => updateField('caregiverPhone', e.target.value)}
                placeholder="919876543210"
                style={inputStyle}
              />
            </div>

            <div style={fieldGroup}>
              <label style={labelStyle}>Relationship</label>
              <select
                value={form.caregiverRelationship}
                onChange={e => updateField('caregiverRelationship', e.target.value)}
                style={inputStyle}
              >
                <option value="">Select relationship</option>
                <option value="spouse">Spouse</option>
                <option value="son">Son</option>
                <option value="daughter">Daughter</option>
                <option value="parent">Parent</option>
                <option value="sibling">Sibling</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary"
            style={{
              padding: '12px 24px',
              fontSize: '0.9rem',
              opacity: loading ? 0.7 : 1,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Registering...' : (
              <>
                <UserPlus size={16} />
                Register Patient
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => navigate('/patients')}
            className="btn btn-outline"
            style={{ padding: '12px 24px', fontSize: '0.9rem' }}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
