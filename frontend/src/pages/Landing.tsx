import { useNavigate } from 'react-router-dom';
import {
  Heart,
  Shield,
  Brain,
  MessageCircle,
  Smartphone,
  Activity,
  Users,
  TrendingUp,
  ArrowRight,
  CheckCircle,
  Zap,
  Globe,
  Bot,
  ChevronRight,
} from 'lucide-react';

export default function Landing() {
  const navigate = useNavigate();

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', overflow: 'hidden' }}>
      {/* Navbar */}
      <nav style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        background: 'rgba(255,255,255,0.85)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--border)',
        padding: '16px 48px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Heart size={26} color="#6366f1" fill="#6366f1" />
          <span style={{
            fontSize: '1.3rem',
            fontWeight: 700,
            background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>NovaCare</span>
          <span style={{
            fontSize: '0.65rem',
            color: 'var(--text-muted)',
            background: 'var(--bg-primary)',
            padding: '2px 8px',
            borderRadius: '4px',
            fontWeight: 500,
          }}>v2.0</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <a
            href="/about"
            onClick={(e) => { e.preventDefault(); navigate('/about'); }}
            style={{
              color: 'var(--text-secondary)',
              textDecoration: 'none',
              fontSize: '0.9rem',
              fontWeight: 500,
              transition: 'color 0.2s',
            }}
          >About</a>
          <button
            onClick={() => navigate('/login')}
            style={{
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              color: 'white',
              border: 'none',
              padding: '10px 20px',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s',
              boxShadow: '0 4px 12px rgba(99,102,241,0.3)',
            }}
          >Hospital Login</button>
        </div>
      </nav>

      {/* Hero Section */}
      <section style={{
        paddingTop: '140px',
        paddingBottom: '80px',
        textAlign: 'center',
        position: 'relative',
      }}>
        {/* Background gradient orbs */}
        <div style={{
          position: 'absolute',
          top: '60px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '600px',
          height: '600px',
          background: 'radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 70%)',
          borderRadius: '50%',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute',
          top: '200px',
          right: '10%',
          width: '300px',
          height: '300px',
          background: 'radial-gradient(circle, rgba(16,185,129,0.06) 0%, transparent 70%)',
          borderRadius: '50%',
          pointerEvents: 'none',
        }} />

        <div className="landing-fade-in" style={{ position: 'relative', zIndex: 1, maxWidth: '800px', margin: '0 auto', padding: '0 24px' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            background: 'rgba(99,102,241,0.08)',
            border: '1px solid rgba(99,102,241,0.15)',
            borderRadius: '20px',
            padding: '6px 16px',
            marginBottom: '24px',
            fontSize: '0.8rem',
            color: '#6366f1',
            fontWeight: 600,
          }}>
            <Zap size={14} /> AI-Powered Post-Discharge Care
          </div>

          <h1 style={{
            fontSize: 'clamp(2.2rem, 5vw, 3.5rem)',
            fontWeight: 800,
            lineHeight: 1.15,
            color: 'var(--text-primary)',
            marginBottom: '20px',
          }}>
            Keeping the light on for{' '}
            <span style={{
              background: 'linear-gradient(135deg, #6366f1, #10b981)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>30 days</span>{' '}
            after every hospital discharge
          </h1>

          <p style={{
            fontSize: '1.1rem',
            color: 'var(--text-secondary)',
            maxWidth: '600px',
            margin: '0 auto 40px',
            lineHeight: 1.6,
          }}>
            6 AI agents working 24/7 to reduce readmissions, improve adherence, and save lives — built for India's healthcare ecosystem.
          </p>

          <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => navigate('/login')}
              style={{
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                color: 'white',
                border: 'none',
                padding: '14px 32px',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.95rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 8px 24px rgba(99,102,241,0.35)',
                transition: 'all 0.3s',
              }}
            >Hospital Login <ArrowRight size={18} /></button>
            <button
              onClick={() => navigate('/about')}
              style={{
                background: 'transparent',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border)',
                padding: '14px 32px',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.95rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.3s',
              }}
            >Meet the Team <ChevronRight size={18} /></button>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="landing-fade-in" style={{
        padding: '40px 48px 80px',
        maxWidth: '1000px',
        margin: '0 auto',
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '24px',
        }}>
          {[
            { value: '27 Cr+', label: 'NCD Patients in India', icon: Users, color: '#6366f1' },
            { value: '1 in 5', label: 'Readmitted within 30 days', icon: Activity, color: '#ef4444' },
            { value: '333x', label: 'ROI per ₹1 invested', icon: TrendingUp, color: '#10b981' },
          ].map((stat, i) => (
            <div key={i} className="landing-stat-card" style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              padding: '28px',
              textAlign: 'center',
              transition: 'all 0.3s',
              position: 'relative',
              overflow: 'hidden',
            }}>
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: '3px',
                background: `linear-gradient(90deg, ${stat.color}, ${stat.color}88)`,
              }} />
              <stat.icon size={28} color={stat.color} style={{ marginBottom: '12px' }} />
              <div style={{ fontSize: '2rem', fontWeight: 800, color: stat.color }}>{stat.value}</div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px', fontWeight: 500 }}>{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* How It Works */}
      <section style={{
        padding: '80px 48px',
        background: 'var(--bg-secondary)',
        borderTop: '1px solid var(--border)',
        borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '56px' }}>
            <h2 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '12px' }}>How NovaCare Works</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', maxWidth: '500px', margin: '0 auto' }}>
              From discharge to recovery — an intelligent care continuum
            </p>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '32px',
          }}>
            {[
              {
                step: '01',
                title: 'Discharge Plan',
                desc: 'AI generates a personalized 30-day care plan from clinical notes via ABDM',
                icon: Shield,
                color: '#6366f1',
              },
              {
                step: '02',
                title: 'Daily Check-ins',
                desc: 'WhatsApp & IVR reach patients in their language every day',
                icon: MessageCircle,
                color: '#3b82f6',
              },
              {
                step: '03',
                title: 'Risk Scoring',
                desc: 'ML model predicts readmission risk and triggers escalations',
                icon: Brain,
                color: '#f59e0b',
              },
              {
                step: '04',
                title: 'Smart Escalation',
                desc: 'High-risk patients are routed to doctors with full context',
                icon: Activity,
                color: '#ef4444',
              },
            ].map((item, i) => (
              <div key={i} className="landing-step-card" style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-lg)',
                padding: '28px',
                transition: 'all 0.3s',
                position: 'relative',
              }}>
                <div style={{
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  color: item.color,
                  letterSpacing: '0.1em',
                  marginBottom: '16px',
                  textTransform: 'uppercase',
                }}>Step {item.step}</div>
                <div style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: 'var(--radius-sm)',
                  background: `${item.color}12`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '16px',
                }}>
                  <item.icon size={22} color={item.color} />
                </div>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '8px' }}>{item.title}</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Key Features */}
      <section style={{ padding: '80px 48px' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '56px' }}>
            <h2 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '12px' }}>Key Features</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', maxWidth: '500px', margin: '0 auto' }}>
              Built for scale, designed for India
            </p>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '24px',
          }}>
            {[
              {
                icon: Bot,
                title: '6 AI Agents',
                desc: 'Specialized agents for discharge, daily pulse, risk, pharmacy, family, and outcomes',
                color: '#6366f1',
              },
              {
                icon: MessageCircle,
                title: 'WhatsApp + IVR',
                desc: 'Reach patients via WhatsApp in 12 languages with IVR fallback for non-smartphone users',
                color: '#10b981',
              },
              {
                icon: Brain,
                title: 'ML Risk Scoring',
                desc: 'SageMaker-powered readmission prediction with real-time feature engineering',
                color: '#f59e0b',
              },
              {
                icon: Globe,
                title: 'India Stack',
                desc: 'ABDM/ABHA integration, Aadhaar eKYC, UPI for pharmacy payments',
                color: '#3b82f6',
              },
              {
                icon: Smartphone,
                title: 'Vernacular AI',
                desc: 'Amazon Bedrock generates culturally-aware content in patient\'s preferred language',
                color: '#8b5cf6',
              },
              {
                icon: Shield,
                title: 'Enterprise Ready',
                desc: 'AWS-native, HIPAA-aligned, auto-scaling infrastructure with 99.9% uptime SLA',
                color: '#06b6d4',
              },
            ].map((feature, i) => (
              <div key={i} className="landing-feature-card" style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-lg)',
                padding: '28px',
                transition: 'all 0.3s',
                display: 'flex',
                gap: '16px',
                alignItems: 'flex-start',
              }}>
                <div style={{
                  width: '44px',
                  height: '44px',
                  minWidth: '44px',
                  borderRadius: 'var(--radius-sm)',
                  background: `${feature.color}12`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <feature.icon size={22} color={feature.color} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '6px' }}>{feature.title}</h3>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{feature.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section style={{
        padding: '80px 48px',
        background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #6366f1 100%)',
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute',
          top: '-50%',
          left: '-10%',
          width: '400px',
          height: '400px',
          background: 'rgba(255,255,255,0.05)',
          borderRadius: '50%',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute',
          bottom: '-30%',
          right: '-5%',
          width: '300px',
          height: '300px',
          background: 'rgba(255,255,255,0.03)',
          borderRadius: '50%',
          pointerEvents: 'none',
        }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <h2 style={{ fontSize: '2rem', fontWeight: 700, color: 'white', marginBottom: '12px' }}>
            Ready to reduce readmissions?
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '1rem', marginBottom: '32px', maxWidth: '500px', margin: '0 auto 32px' }}>
            Join India's most advanced post-discharge care platform
          </p>
          <button
            onClick={() => navigate('/login')}
            style={{
              background: 'white',
              color: '#6366f1',
              border: 'none',
              padding: '14px 36px',
              borderRadius: 'var(--radius-sm)',
              fontSize: '1rem',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
              transition: 'all 0.3s',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >Hospital Login <ArrowRight size={18} /></button>
        </div>
      </section>

      {/* Footer */}
      <footer style={{
        padding: '32px 48px',
        background: 'var(--bg-secondary)',
        borderTop: '1px solid var(--border)',
        textAlign: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '8px' }}>
          <Heart size={16} color="#6366f1" fill="#6366f1" />
          <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9rem' }}>NovaCare v2.0</span>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
          © 2026 Team AvengersJIS | Cognizant Technoverse
        </p>
        <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'center', gap: '24px' }}>
          <a
            href="/about"
            onClick={(e) => { e.preventDefault(); navigate('/about'); }}
            style={{ color: 'var(--text-secondary)', textDecoration: 'none', fontSize: '0.8rem' }}
          >About</a>
          <a
            href="/login"
            onClick={(e) => { e.preventDefault(); navigate('/login'); }}
            style={{ color: 'var(--text-secondary)', textDecoration: 'none', fontSize: '0.8rem' }}
          >Login</a>
        </div>
      </footer>
    </div>
  );
}
