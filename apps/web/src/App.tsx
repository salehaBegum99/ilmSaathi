import { Route, Routes } from 'react-router-dom';
import { LandingPage } from './pages/LandingPage';
import { ExplorePage } from './pages/ExplorePage';
import { EducatorPage } from './pages/EducatorPage';
import { LoginPage, RegisterPage } from './pages/AuthPages';
import { OnboardingPage } from './pages/OnboardingPage';
import { TeachPage } from './pages/TeachPage';
import { DashboardPage } from './pages/DashboardPage';
import { AdminPage } from './pages/AdminPage';
import { HowItWorksPage, LegalPage, NotFoundPage, SafetyPage } from './pages/InfoPages';

export default function App() {
  return <Routes>
    <Route path="/" element={<LandingPage />} />
    <Route path="/explore" element={<ExplorePage />} />
    <Route path="/educators/:slug" element={<EducatorPage />} />
    <Route path="/login" element={<LoginPage />} />
    <Route path="/register" element={<RegisterPage />} />
    <Route path="/onboarding" element={<OnboardingPage />} />
    <Route path="/teach" element={<TeachPage />} />
    <Route path="/dashboard" element={<DashboardPage />} />
    <Route path="/admin" element={<AdminPage />} />
    <Route path="/how-it-works" element={<HowItWorksPage />} />
    <Route path="/safety" element={<SafetyPage />} />
    <Route path="/privacy" element={<LegalPage />} />
    <Route path="/terms" element={<LegalPage />} />
    <Route path="*" element={<NotFoundPage />} />
  </Routes>;
}
