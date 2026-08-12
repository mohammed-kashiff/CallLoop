import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/AppLayout'
import { AuditProvider } from './context/AuditContext'
import { AgentsPulse } from './pages/AgentsPulse'
import { ChurnRisk } from './pages/ChurnRisk'
import { Feedbacks } from './pages/Feedbacks'
import './App.css'

function App() {
  return (
    <BrowserRouter>
      <AuditProvider>
        <Routes>
          <Route element={<AppLayout />}>
            <Route index element={<AgentsPulse />} />
            <Route path="feedbacks" element={<Feedbacks />} />
            <Route path="churn-risk" element={<ChurnRisk />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </AuditProvider>
    </BrowserRouter>
  )
}

export default App
