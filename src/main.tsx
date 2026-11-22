import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider, createBrowserRouter } from 'react-router';
import './index.css';
import { Layout, NotFoundState } from './components/Layout';
import { FeedbackProvider } from './components/ui';
import { I18nProvider } from './lib/i18n';
import { Admin } from './pages/Admin';
import { Home } from './pages/Home';
import { Links } from './pages/Links';
import { Manage } from './pages/Manage';
import { MyAccount } from './pages/MyAccount';
import { MySignup } from './pages/MySignup';
import { NewBoard } from './pages/NewBoard';
import { PublicBoard } from './pages/PublicBoard';

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <Home /> },
      { path: '/new', element: <NewBoard /> },
      { path: '/b/:slug', element: <PublicBoard /> },
      { path: '/s/:token', element: <MySignup /> },
      { path: '/m/:token', element: <Manage /> },
      { path: '/links', element: <Links /> },
      { path: '/admin', element: <Admin /> },
      { path: '/me', element: <MyAccount /> },
      { path: '*', element: <NotFoundState /> },
    ],
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <FeedbackProvider>
        <RouterProvider router={router} />
      </FeedbackProvider>
    </I18nProvider>
  </StrictMode>,
);
