import Navigation from "@/components/Navigation";
import Hero from "@/components/Hero";
import Features from "@/components/Features";
import AIProcess from "@/components/AIProcess";
import HomeChat from "@/components/HomeChat";
import CTA from "@/components/CTA";
import Footer from "@/components/Footer";

const Index = () => {
  return (
    <div className="min-h-screen">
      <Navigation />
      <Hero />
      <Features />
      <AIProcess />
      <HomeChat />
      <CTA />
      <Footer />
    </div>
  );
};

export default Index;
