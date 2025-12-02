import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import Library from "./pages/Library";
import CoursesPage from "./pages/CoursesPage";
import Chat from "./pages/Chat";
import Achievements from "./pages/Achievements";
import Exams from "./pages/Exams";
import Account from "./pages/Account";
import Login from "./pages/Login";
import Register from "./pages/Register";
import CourseStart from "./pages/CourseStart";
import LearningMode from "./pages/LearningMode";
import CourseChat from "./pages/CourseChat";
import VoiceChat from "./pages/VoiceChat";
import Homework from "./pages/Homework";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/library" element={<Library />} />
            <Route path="/courses" element={<ProtectedRoute><CoursesPage /></ProtectedRoute>} />
            <Route path="/chat" element={<ProtectedRoute><Chat /></ProtectedRoute>} />
            <Route path="/achievements" element={<ProtectedRoute><Achievements /></ProtectedRoute>} />
            <Route path="/exams" element={<ProtectedRoute><Exams /></ProtectedRoute>} />
            <Route path="/account" element={<Account />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/course-start/:subjectId" element={<ProtectedRoute><CourseStart /></ProtectedRoute>} />
            <Route path="/learning-mode/:courseId" element={<ProtectedRoute><LearningMode /></ProtectedRoute>} />
            <Route path="/course-chat/:courseId" element={<ProtectedRoute><CourseChat /></ProtectedRoute>} />
            <Route path="/voice-chat/:courseId" element={<ProtectedRoute><VoiceChat key={`voice-chat-${Date.now()}`} /></ProtectedRoute>} />
            <Route path="/homework" element={<ProtectedRoute><Homework /></ProtectedRoute>} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
