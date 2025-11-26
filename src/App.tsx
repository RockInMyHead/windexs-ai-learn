import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Library from "./pages/Library";
import CoursesPage from "./pages/CoursesPage";
import Chat from "./pages/Chat";
import Achievements from "./pages/Achievements";
import Exams from "./pages/Exams";
import Account from "./pages/Account";
import CourseStart from "./pages/CourseStart";
import LearningMode from "./pages/LearningMode";
import CourseChat from "./pages/CourseChat";
import VoiceChat from "./pages/VoiceChat";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/library" element={<Library />} />
          <Route path="/courses" element={<CoursesPage />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/achievements" element={<Achievements />} />
          <Route path="/exams" element={<Exams />} />
          <Route path="/account" element={<Account />} />
          <Route path="/course-start/:subjectId" element={<CourseStart />} />
          <Route path="/learning-mode/:courseId" element={<LearningMode />} />
          <Route path="/course-chat/:courseId" element={<CourseChat />} />
          <Route path="/voice-chat/:courseId" element={<VoiceChat />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
