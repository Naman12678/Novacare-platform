import { useNavigate } from 'react-router-dom';
import {
  Heart,
  ArrowLeft,
  Users,
  Brain,
  MessageCircle,
  Pill,
  Network,
  BarChart3,
  Server,
  Cloud,
  Database,
  Smartphone,
  Globe,
  Shield,
  Cpu,
  Bot,
} from 'lucide-react';

const teamMembers = [
  {
    name: 'Naman Sharma',
    role: 'Agent 1 (Discharge Architect) + ABDM + Infrastructure',
    color: '#6366f1',
    icon: Shield,
    contributions: ['Discharge plan generation', 'ABDM/ABHA integration', 'AWS CDK infrastructure', 'System architecture'],
  },
  {
    name: 'Koustav Paul',
    role: 'Agent 3 (Risk Orchestrator) + ML Pipeline + SageMaker',
    color: '#f59e0b',
    icon: Brain,
    contributions: ['ML risk scoring model', 'Feature engineering', 'SageMaker deployment', 'LangGraph orchestration'],
  },
  {
    name: 'Puspita Jana',
    role: 'Agent 2 (Daily Pulse) + Agent 5 (Family Network) + WhatsApp/IVR',
    color: '#10b981',
    icon: MessageCircle,
    contributions: ['Daily check-in flows', 'WhatsApp Business API', 'IVR fallback system', 'Family engagement loops'],
  },
  {
    name: 'Kasturi Dewan',
    role: 'Agent 4 (Pharmacy Bridge) + Agent 6 (Outcomes) + Frontend',
    color: '#8b5cf6',
    icon: BarChart3,
    contributions: ['Pharmacy adherence tracking', 'Outcomes & learning agent', 'React dashboard', 'UX design'],
  },
];

const techStack = [
  { category: 'AI/ML', items: ['Amazon Bedrock (Claude)', 'SageMaker', 'LangGraph', 'LangChain'], icon: Cpu, color: '#6366f1' },
  { category: 'Backend', items: ['Node.js + TypeScript', 'Prisma ORM', 'BullMQ', 'FastAPI (Python)'], icon: Server, color: '#3b82f6' },
  { category: 'Cloud', items: ['AWS CDK', 'DynamoDB', 'SQS/SNS', 'Lambda'], icon: Cloud, color: '#06b6d4' },
  { category: 'Frontend', items: ['React 19', 'TypeScript', 'Vite', 'Recharts'], icon: Globe, color: '#10b981' },
  { category: 'Data', items: ['PostgreSQL', 'DynamoDB', 'Redis (BullMQ)', 'S3'], icon: Database, color: '#f59e0b' },
  { category: 'Integration', items: ['WhatsApp Business', 'Exotel IVR', 'ABDM/ABHA', 'UPI'], icon: Smartphone, color: '#8b5cf6' },
];

export default function About() {
  const navigate = useNavigate();

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
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
            href="/"
            onClick={(e) => { e.preventDefault(); navigate('/'); }}
            style={{ color: 'var(--text-secondary)', textDecoration: 'none', fontSize: '0.9rem', fontWeight: 500 }}
          >Home</a>
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
              boxShadow: '0 4px 12px rgba(99,102,241,0.3)',
            }}
          >Hospital Login</button>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ paddingTop: '120px', paddingBottom: '60px', textAlign: 'center' }}>
        <div className="landing-fade-in" style={{ maxWidth: '700px', margin: '0 auto', padding: '0 24px' }}>
          <button
            onClick={() => navigate('/')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: 'none',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '8px 16px',
              color: 'var(--text-secondary)',
              fontSize: '0.8rem',
              fontWeight: 500,
              cursor: 'pointer',
              marginBottom: '32px',
              transition: 'all 0.2s',
            }}
          ><ArrowLeft size={14} /> Back to Home</button>

          <h1 style={{
            fontSize: 'clamp(2rem, 4vw, 2.8rem)',
            fontWeight: 800,
            marginBottom: '16px',
            color: 'var(--text-primary)',
          }}>
            Built by{' '}
            <span style={{
              background: 'linear-gradient(135deg, #6366f1, #10b981)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>Team AvengersJIS</span>
          </h1>
          <p style={{
            fontSize: '1.05rem',
            color: 'var(--text-secondary)',
            lineHeight: 1.6,
            maxWidth: '600px',
            margin: '0 auto',
          }}>
            We believe every patient deserves continuous care after discharge. Our mission is to eliminate preventable readmissions through intelligent, empathetic AI that speaks India's languages.
          </p>
        </div>
      </section>

      {/* Team Section */}
      <section style={{ padding: '40px 48px 80px', maxWidth: '1100px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            background: 'rgba(99,102,241,0.08)',
            border: '1px solid rgba(99,102,241,0.15)',
            borderRadius: '20px',
            padding: '6px 16px',
            marginBottom: '16px',
            fontSize: '0.8rem',
            color: '#6366f1',
            fontWeight: 600,
          }}>
            <Users size={14} /> The Team
          </div>
          <h2 style={{ fontSize: '1.8rem', fontWeight: 700 }}>Meet the Builders</h2>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '24px',
        }}>
          {teamMembers.map((member, i) => (
            <div key={i} className="landing-feature-card" style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              padding: '28px',
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
                background: `linear-gradient(90deg, ${member.color}, ${member.color}88)`,
              }} />
              <div style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                background: `${member.color}12`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '16px',
              }}>
                <member.icon size={22} color={member.color} />
              </div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '4px' }}>{member.name}</h3>
              <p style={{
                fontSize: '0.8rem',
                color: member.color,
                fontWeight: 600,
                marginBottom: '16px',
                lineHeight: 1.4,
              }}>{member.role}</p>
              <ul style={{ listStyle: 'none', padding: 0 }}>
                {member.contributions.map((c, j) => (
                  <li key={j} style={{
                    fontSize: '0.82rem',
                    color: 'var(--text-secondary)',
                    padding: '4px 0',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}>
                    <div style={{
                      width: '5px',
                      height: '5px',
                      borderRadius: '50%',
                      background: member.color,
                      flexShrink: 0,
                    }} />
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* Mission */}
      <section style={{
        padding: '80px 48px',
        background: 'var(--bg-secondary)',
        borderTop: '1px solid var(--border)',
        borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ maxWidth: '800px', margin: '0 auto', textAlign: 'center' }}>
          <Bot size={36} color="#6366f1" style={{ marginBottom: '20px' }} />
          <h2 style={{ fontSize: '1.8rem', fontWeight: 700, marginBottom: '20px' }}>Our Mission</h2>
          <p style={{
            fontSize: '1.1rem',
            color: 'var(--text-secondary)',
            lineHeight: 1.8,
            marginBottom: '24px',
          }}>
            India has over 27 crore NCD patients, and 1 in 5 are readmitted within 30 days of discharge.
            NovaCare deploys 6 specialized AI agents that work around the clock — reaching patients via
            WhatsApp and IVR in their own language, predicting risk before it escalates, and coordinating
            care across families, pharmacies, and hospitals.
          </p>
          <p style={{
            fontSize: '1rem',
            color: 'var(--text-secondary)',
            lineHeight: 1.7,
          }}>
            Built on AWS with India Stack integration (ABDM, ABHA, Aadhaar eKYC), NovaCare delivers
            a <strong style={{ color: 'var(--text-primary)' }}>333x ROI</strong> per rupee invested — proving that
            AI-powered post-discharge care isn't just compassionate, it's economically transformative.
          </p>
        </div>
      </section>

      {/* Tech Stack */}
      <section style={{ padding: '80px 48px' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '48px' }}>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              background: 'rgba(16,185,129,0.08)',
              border: '1px solid rgba(16,185,129,0.15)',
              borderRadius: '20px',
              padding: '6px 16px',
              marginBottom: '16px',
              fontSize: '0.8rem',
              color: '#10b981',
              fontWeight: 600,
            }}>
              <Network size={14} /> Architecture
            </div>
            <h2 style={{ fontSize: '1.8rem', fontWeight: 700 }}>Technology Stack</h2>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '24px',
          }}>
            {techStack.map((tech, i) => (
              <div key={i} className="landing-feature-card" style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-lg)',
                padding: '24px',
                transition: 'all 0.3s',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                  <div style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: 'var(--radius-sm)',
                    background: `${tech.color}12`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <tech.icon size={18} color={tech.color} />
                  </div>
                  <h3 style={{ fontSize: '0.95rem', fontWeight: 600 }}>{tech.category}</h3>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {tech.items.map((item, j) => (
                    <span key={j} style={{
                      fontSize: '0.78rem',
                      padding: '4px 10px',
                      background: 'var(--bg-primary)',
                      borderRadius: '12px',
                      color: 'var(--text-secondary)',
                      fontWeight: 500,
                      border: '1px solid var(--border)',
                    }}>{item}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
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
            href="/"
            onClick={(e) => { e.preventDefault(); navigate('/'); }}
            style={{ color: 'var(--text-secondary)', textDecoration: 'none', fontSize: '0.8rem' }}
          >Home</a>
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
