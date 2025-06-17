import { StrictMode, useEffect, useState } from 'react';
import Header from '../components/header';
import './home.css';
import { FaSeedling, FaPlay, FaTachometerAlt, FaCalendar, FaUsers, FaBook, FaClipboardCheck, FaChartLine, FaCog, FaSignOutAlt, FaMale, FaCcMastercard } from "react-icons/fa";

function Home (){
    const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const canvas = document.getElementById('particles');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    class Particle {
      constructor() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.size = Math.random() * 3 + 1;
        this.speedX = Math.random() * 3 - 1.5;
        this.speedY = Math.random() * 3 - 1.5;
        this.color = `rgba(47, 129, 247, ${Math.random() * 0.5 + 0.1})`;
      }

      update() {
        this.x += this.speedX;
        this.y += this.speedY;

        if (this.x > canvas.width || this.x < 0) {
          this.speedX = -this.speedX;
        }

        if (this.y > canvas.height || this.y < 0) {
          this.speedY = -this.speedY;
        }
      }

      draw() {
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const particles = [];
    for (let i = 0; i < 100; i++) {
      particles.push(new Particle());
    }

    function animate() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (let i = 0; i < particles.length; i++) {
        for (let j = i; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < 100) {
            ctx.strokeStyle = `rgba(47, 129, 247, ${1 - distance / 100})`;
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }

      particles.forEach(particle => {
        particle.update();
        particle.draw();
      });

      requestAnimationFrame(animate);
    }

    animate();

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    window.addEventListener('resize', handleResize);

    const animateCounters = () => {
      const counters = document.querySelectorAll('.stat-number');
      const speed = 200;

      counters.forEach(counter => {
        const target = +counter.getAttribute('data-target');
        const count = +counter.innerText;
        const increment = target / speed;

        if (count < target) {
          counter.innerText = Math.ceil(count + increment);
          setTimeout(animateCounters, 1);
        } else {
          counter.innerText = target;
        }
      });
    };

    const statsSection = document.querySelector('.stats');
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        document.getElementById('tutors-count').setAttribute('data-target', '8500');
        document.getElementById('students-count').setAttribute('data-target', '125000');
        document.getElementById('sessions-count').setAttribute('data-target', '2500000');
        document.getElementById('countries-count').setAttribute('data-target', '85');
        animateCounters();
        observer.unobserve(statsSection);
      }
    }, { threshold: 0.5 });

    if (statsSection) {
      observer.observe(statsSection);
    }

    const handleAnchorClick = (e) => {
      e.preventDefault();

      const targetId = e.currentTarget.getAttribute('href');
      if (targetId === '#') return;

      const targetElement = document.querySelector(targetId);
      if (targetElement) {
        window.scrollTo({
          top: targetElement.offsetTop - 80,
          behavior: 'smooth'
        });
      }
    };

    const anchorLinks = document.querySelectorAll('a[href^="#"]');
    anchorLinks.forEach(anchor => {
      anchor.addEventListener('click', handleAnchorClick);
    });

    const handleMouseMove = (e) => {
      setMousePosition({ x: e.clientX, y: e.clientY });
    };

    window.addEventListener('mousemove', handleMouseMove);

    return () => {
      window.removeEventListener('resize', handleResize);
      anchorLinks.forEach(anchor => {
        anchor.removeEventListener('click', handleAnchorClick);
      });
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  const FeatureCard = ({ icon, title, description }) => {
    return (
      <div className="feature-card-wrapper">
        <div 
          className="feature-card"
          style={{
            '--mouse-x': mousePosition.x,
            '--mouse-y': mousePosition.y,
          }}
        >
          <div className="feature-icon-container">
            <div className="feature-icon">
              <i className={icon}></i>
              <div className="feature-icon-reflection"></div>
            </div>
          </div>
          <h3 className="feature-title">{title}</h3>
          <p className="feature-desc">{description}</p>
        </div>
      </div>
    );
  };

    return (
         <>
        <Header />
      

      {/* Hero Section */}
      <section className="heero">
        <div className="glow glow-primary" style={{ top: '-150px', right: '-150px' }}></div>
        <div className="glow glow-purple" style={{ bottom: '-200px', left: '-200px' }}></div>

        <h1 className="heero-title">The complete AI-powered learning platform</h1>
        <p className="heero-subtitle">From automated scheduling to AI-powered proctoring, Bloom helps educators and students achieve more with intelligent tools designed for modern education.</p>

        <div className="ctaa-buttons">
          <a href="#" className="btnn btnn-primary btnnn-lg">Get started for free</a>
          <a href="#" className="btnn btnn-outline btnnn-lg">
          <FaPlay /> Watch demo
          </a>
        </div>

        <div className="hero-image-container">
          <img src="https://images.unsplash.com/photo-1522202176988-66273c2fd55f?ixlib=rb-1.2.1&auto=format&fit=crop&w=1350&q=80" alt="Students learning with LearnHub" className="hero-image" />
          <div className="hero-image-overlay"></div>
        </div>

        <canvas id="particles" className="particles"></canvas>
      </section>

      {/* Features Section */}
      <section className="features" id="features">
        <div className="glow glow-orange" style={{ top: '50%', left: '-100px' }}></div>
        <div className="features-container">
          <h2 className="section-title">Transform how you teach and learn</h2>
          <div className="features-grid">
            <FeatureCard icon="FaPlay" title="AI-Powered Scheduling" description="Our intelligent system matches students with tutors based on availability, learning style, and subject expertise." />
            <FeatureCard icon="fas fa-eye" title="Smart Proctoring" description="Real-time behavior analysis and facial recognition to maintain academic integrity during exams." />
            <FeatureCard icon="fas fa-video" title="Integrated Tutoring" description="Seamless video sessions with screen sharing, whiteboarding, and automated session recording." />
            <FeatureCard icon="fas fa-chart-line" title="Progress Analytics" description="Detailed performance tracking with personalized recommendations for improvement." />
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="stats">
        <div className="stats-container">
          <h2 className="section-title">Trusted by educators worldwide</h2>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-number" id="tutors-count">0</div>
              <div className="stat-label">Expert Tutors</div>
            </div>
            <div className="stat-card">
              <div className="stat-number" id="students-count">0</div>
              <div className="stat-label">Active Students</div>
            </div>
            <div className="stat-card">
              <div className="stat-number" id="sessions-count">0</div>
              <div className="stat-label">Sessions Completed</div>
            </div>
            <div className="stat-card">
              <div className="stat-number" id="countries-count">0</div>
              <div className="stat-label">Countries</div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="cta">
        <h2 className="cta-title">Start your journey with LearnHub</h2>
        <p className="cta-subtitle">Join thousands of educators and students leveraging AI to enhance the way they teach and learn.</p>
        <div className="cta-buttons">
          <a href="#" className="btn btn-primary btn-lg">Join now</a>
          <a href="#" className="btn btn-outline btn-lg">Learn more</a>
        </div>
      </section>
    </>
    )
}

export default Home