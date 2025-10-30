import Hero from "@/components/Hero";
import Features from "@/components/Features";
import AIProcess from "@/components/AIProcess";
import Courses from "@/components/Courses";
import CTA from "@/components/CTA";
import Footer from "@/components/Footer";

const Index = () => {
  return (
    <div className="min-h-screen">
      <Hero />
      <Features />
      <AIProcess />
      <Courses />
      <CTA />
      <Footer />
    </div>
  );
};

export default Index;
