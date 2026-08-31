import { Toaster as Sonner } from "./components/ui/sonner";
import { TooltipProvider } from "./components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import { Jumper } from '@/pages/Jumper';
import { Connect } from '@/pages/Connect';
import { GameAssetsManager } from '@/pages/GameAssetsManager';
import { ConnectGame } from '@/pages/2048Page';

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/jumper" element={<Jumper />} />
          <Route path="/connect" element={<Connect />} />
          <Route path="/assets" element={<GameAssetsManager />} />
          <Route path="/2048" element={<ConnectGame />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
