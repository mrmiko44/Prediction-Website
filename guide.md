# WinGo AI Prediction - Complete Deployment Guide

## Table of Contents
1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [Supabase Database Setup](#supabase-database-setup)
4. [Complete SQL Schema](#complete-sql-schema)
5. [Environment Setup (Ubuntu)](#environment-setup-ubuntu)
6. [Backend Integration with Supabase](#backend-integration-with-supabase)
7. [Deployment Options](#deployment-options)
8. [Admin Panel Guide](#admin-panel-guide)
9. [API Reference](#api-reference)

---

## Project Overview

**WinGo AI Prediction** is a full-stack web application that provides AI-powered predictions for WinGo color trading games. It features:

- **Dual AI Models**: Markov Chain + LSTM Neural Network
- **4 Game Modes**: 30s, 1min, 3min, 5min
- **2 Prediction Types**: Color (Green/Red/Violet) & Size (Big/Small)
- **User Authentication**: Registration, Login, Profile management
- **Subscription System**: Weekly/Monthly/Yearly/Lifetime plans with BDT pricing
- **Admin Panel**: User management, payment approval, analytics
- **Prediction History**: Last 20 periods with accuracy tracking (Predicted vs Result vs Status)

### Tech Stack (Current)
- **Backend**: Hono (TypeScript) on Cloudflare Workers/Pages
- **Frontend**: Vanilla JS SPA + TailwindCSS CDN
- **AI Engine**: Custom TypeScript (Markov Chain + LSTM-like ensemble)
- **Storage**: In-memory (demo) - to be replaced with Supabase

### Tech Stack (Production with Supabase)
- **Backend**: Hono (TypeScript) or Next.js 14
- **Database**: Supabase (PostgreSQL)
- **Auth**: Supabase Auth
- **Real-time**: Supabase Realtime Subscriptions
- **Edge Functions**: Supabase Edge Functions (for cron jobs)
- **Deployment**: Vercel or Netlify

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Frontend (SPA)                     │
│  - Landing, Login, Signup, Predictions, History      │
│  - Statistics, Subscription, Profile, Admin, Wallet  │
│  - Settings, About                                   │
└──────────────────────┬──────────────────────────────┘
                       │ REST API
┌──────────────────────▼──────────────────────────────┐
│                  Backend (Hono/Next.js)               │
│  - Auth routes (/api/auth/*)                         │
│  - Game data routes (/api/game-history/*)            │
│  - Prediction routes (/api/predict/*)                │
│  - Admin routes (/api/admin/*)                       │
│  - Payment routes (/api/payment/*)                   │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│               Supabase (PostgreSQL)                   │
│  - profiles, subscriptions, game_history             │
│  - predictions, prediction_accuracy                  │
│  - payment_requests, admin_logs                      │
│  - system_settings, notifications                    │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│            External WinGo API                         │
│  https://draw.ar-lottery01.com/WinGo/                │
│  - /WinGo_30S/GetHistoryIssuePage.json               │
│  - /WinGo_1M/GetHistoryIssuePage.json                │
│  - /WinGo_3M/GetHistoryIssuePage.json                │
│  - /WinGo_5M/GetHistoryIssuePage.json                │
└─────────────────────────────────────────────────────┘
```

---

## Supabase Database Setup

### Step 1: Create Supabase Project

1. Go to https://supabase.com and create a free account
2. Click "New Project"
3. Choose organization, name your project (e.g., `wingo-ai-prediction`)
4. Set a strong database password (save it!)
5. Select the nearest region
6. Click "Create new project"

### Step 2: Get API Keys

After project creation, go to **Settings > API**:
- **Project URL**: `https://YOUR_PROJECT_ID.supabase.co`
- **anon (public) key**: For client-side calls
- **service_role key**: For server-side calls (KEEP SECRET!)

### Step 3: Enable Auth

Go to **Authentication > Providers**:
- Enable **Email** provider
- Disable "Confirm email" for testing (re-enable in production)
- Set "Minimum password length" to 6

---

## Complete SQL Schema

Run this in **Supabase SQL Editor** (Dashboard > SQL Editor > New query):

```sql
-- ============================================================
-- WINGO AI PREDICTION - COMPLETE SUPABASE SQL SCHEMA
-- Version: 2.0
-- Date: 2026-02-10
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. PROFILES TABLE (extends Supabase Auth users)
-- ============================================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL DEFAULT '',
  phone TEXT DEFAULT '',
  avatar_url TEXT DEFAULT '',
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  is_banned BOOLEAN NOT NULL DEFAULT FALSE,
  language TEXT NOT NULL DEFAULT 'en',
  timezone TEXT NOT NULL DEFAULT 'Asia/Dhaka',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================================
-- 2. SUBSCRIPTIONS TABLE
-- ============================================================
CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'weekly', 'monthly', 'yearly', 'lifetime')),
  status TEXT NOT NULL DEFAULT 'inactive' CHECK (status IN ('active', 'inactive', 'expired', 'cancelled')),
  price_bdt INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  activated_by UUID REFERENCES public.profiles(id), -- admin who activated
  transaction_id TEXT, -- payment transaction ID
  payment_method TEXT, -- bkash, nagad, rocket
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON public.subscriptions(status);

CREATE TRIGGER subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================================
-- 3. GAME HISTORY TABLE (cached from external API)
-- ============================================================
CREATE TABLE public.game_history (
  id BIGSERIAL PRIMARY KEY,
  game_type TEXT NOT NULL CHECK (game_type IN ('30s', '1min', '3min', '5min')),
  period TEXT NOT NULL,
  number INTEGER NOT NULL CHECK (number >= 0 AND number <= 9),
  color TEXT NOT NULL, -- green, red, violet, green,violet, red,violet
  size TEXT NOT NULL CHECK (size IN ('Big', 'Small')),
  draw_time TIMESTAMPTZ NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(game_type, period)
);

CREATE INDEX idx_game_history_type_period ON public.game_history(game_type, period DESC);
CREATE INDEX idx_game_history_draw_time ON public.game_history(draw_time DESC);

-- ============================================================
-- 4. PREDICTIONS TABLE (AI predictions)
-- ============================================================
CREATE TABLE public.predictions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  game_type TEXT NOT NULL CHECK (game_type IN ('30s', '1min', '3min', '5min')),
  model_type TEXT NOT NULL CHECK (model_type IN ('model_1', 'model_2')),
  period TEXT NOT NULL, -- predicted period
  predicted_color TEXT NOT NULL,
  predicted_size TEXT NOT NULL,
  color_confidence REAL NOT NULL DEFAULT 0,
  size_confidence REAL NOT NULL DEFAULT 0,
  overall_confidence REAL NOT NULL DEFAULT 0,
  color_probabilities JSONB NOT NULL DEFAULT '{}',
  size_probabilities JSONB NOT NULL DEFAULT '{}',
  patterns_detected TEXT[] DEFAULT '{}',
  training_records INTEGER NOT NULL DEFAULT 0,
  actual_color TEXT, -- filled after result comes
  actual_size TEXT,
  actual_number INTEGER,
  color_correct BOOLEAN, -- filled after result
  size_correct BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_predictions_game_type ON public.predictions(game_type, created_at DESC);
CREATE INDEX idx_predictions_period ON public.predictions(game_type, period);

-- ============================================================
-- 5. PAYMENT REQUESTS TABLE
-- ============================================================
CREATE TABLE public.payment_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan TEXT NOT NULL CHECK (plan IN ('weekly', 'monthly', 'yearly', 'lifetime')),
  amount_bdt INTEGER NOT NULL,
  transaction_id TEXT NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('bkash', 'nagad', 'rocket', 'other')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID REFERENCES public.profiles(id), -- admin who reviewed
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payment_requests_user ON public.payment_requests(user_id, created_at DESC);
CREATE INDEX idx_payment_requests_status ON public.payment_requests(status);

-- ============================================================
-- 6. USER STATISTICS TABLE
-- ============================================================
CREATE TABLE public.user_statistics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  game_type TEXT NOT NULL,
  total_predictions INTEGER NOT NULL DEFAULT 0,
  color_correct INTEGER NOT NULL DEFAULT 0,
  color_incorrect INTEGER NOT NULL DEFAULT 0,
  size_correct INTEGER NOT NULL DEFAULT 0,
  size_incorrect INTEGER NOT NULL DEFAULT 0,
  current_streak INTEGER NOT NULL DEFAULT 0,
  best_streak INTEGER NOT NULL DEFAULT 0,
  last_prediction_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, game_type)
);

CREATE INDEX idx_user_statistics_user ON public.user_statistics(user_id);

-- ============================================================
-- 7. MODEL PERFORMANCE TABLE
-- ============================================================
CREATE TABLE public.model_performance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  game_type TEXT NOT NULL,
  model_type TEXT NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_predictions INTEGER NOT NULL DEFAULT 0,
  color_correct INTEGER NOT NULL DEFAULT 0,
  size_correct INTEGER NOT NULL DEFAULT 0,
  color_accuracy REAL NOT NULL DEFAULT 0,
  size_accuracy REAL NOT NULL DEFAULT 0,
  overall_accuracy REAL NOT NULL DEFAULT 0,
  avg_confidence REAL NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(game_type, model_type, date)
);

CREATE INDEX idx_model_performance_date ON public.model_performance(date DESC);

-- ============================================================
-- 8. ADMIN LOGS TABLE
-- ============================================================
CREATE TABLE public.admin_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_id UUID NOT NULL REFERENCES public.profiles(id),
  action TEXT NOT NULL, -- e.g., 'approve_payment', 'activate_user', 'ban_user'
  target_user_id UUID REFERENCES public.profiles(id),
  details JSONB DEFAULT '{}',
  ip_address TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_admin_logs_admin ON public.admin_logs(admin_id, created_at DESC);

-- ============================================================
-- 9. SYSTEM SETTINGS TABLE
-- ============================================================
CREATE TABLE public.system_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}',
  description TEXT DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES public.profiles(id)
);

-- Insert default settings
INSERT INTO public.system_settings (key, value, description) VALUES
  ('subscription_plans', '{"weekly": {"price": 180, "days": 7}, "monthly": {"price": 499, "days": 30}, "yearly": {"price": 4999, "days": 365}, "lifetime": {"price": 19999, "days": 999999}}', 'Subscription plan pricing'),
  ('payment_number', '{"number": "01756519749", "methods": ["bkash", "nagad", "rocket"]}', 'Payment receiving number'),
  ('admin_email', '"emonarafath60@gmail.com"', 'Admin email address'),
  ('maintenance_mode', 'false', 'Enable/disable maintenance mode'),
  ('prediction_config', '{"auto_refresh_interval": 15, "models": ["model_1", "model_2"], "game_types": ["30s", "1min", "3min", "5min"]}', 'Prediction configuration');

-- ============================================================
-- 10. NOTIFICATIONS TABLE
-- ============================================================
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'info' CHECK (type IN ('info', 'success', 'warning', 'error')),
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  action_url TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON public.notifications(user_id, is_read, created_at DESC);

-- ============================================================
-- 11. API CALL LOGS TABLE
-- ============================================================
CREATE TABLE public.api_call_logs (
  id BIGSERIAL PRIMARY KEY,
  game_type TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  status_code INTEGER,
  response_size INTEGER DEFAULT 0,
  records_fetched INTEGER DEFAULT 0,
  error_message TEXT DEFAULT '',
  duration_ms INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_api_logs_created ON public.api_call_logs(created_at DESC);

-- ============================================================
-- 12. USER ACHIEVEMENTS TABLE
-- ============================================================
CREATE TABLE public.user_achievements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  achievement_key TEXT NOT NULL, -- e.g., 'first_prediction', '100_predictions', '10_streak'
  achieved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, achievement_key)
);

-- ============================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_statistics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.model_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;

-- PROFILES: Users can read their own, admins can read all
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE)
  );

-- SUBSCRIPTIONS: Users can view own
CREATE POLICY "Users can view own subscriptions" ON public.subscriptions
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Admins can manage subscriptions" ON public.subscriptions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE)
  );

-- GAME HISTORY: Public read
CREATE POLICY "Anyone can read game history" ON public.game_history
  FOR SELECT USING (TRUE);
CREATE POLICY "Service role can insert game history" ON public.game_history
  FOR INSERT WITH CHECK (TRUE);

-- PREDICTIONS: Public read
CREATE POLICY "Anyone can read predictions" ON public.predictions
  FOR SELECT USING (TRUE);
CREATE POLICY "Service role can insert predictions" ON public.predictions
  FOR INSERT WITH CHECK (TRUE);

-- PAYMENT REQUESTS: Users can view own, admins can view/manage all
CREATE POLICY "Users can view own payments" ON public.payment_requests
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can create payments" ON public.payment_requests
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Admins can manage payments" ON public.payment_requests
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE)
  );

-- USER STATISTICS: Users can view own
CREATE POLICY "Users can view own stats" ON public.user_statistics
  FOR SELECT USING (user_id = auth.uid());

-- MODEL PERFORMANCE: Public read
CREATE POLICY "Anyone can read model performance" ON public.model_performance
  FOR SELECT USING (TRUE);

-- ADMIN LOGS: Admins only
CREATE POLICY "Admins can view logs" ON public.admin_logs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE)
  );

-- SYSTEM SETTINGS: Public read, admin write
CREATE POLICY "Anyone can read settings" ON public.system_settings
  FOR SELECT USING (TRUE);
CREATE POLICY "Admins can update settings" ON public.system_settings
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE)
  );

-- NOTIFICATIONS: Users can view own
CREATE POLICY "Users can view own notifications" ON public.notifications
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can update own notifications" ON public.notifications
  FOR UPDATE USING (user_id = auth.uid());

-- ACHIEVEMENTS: Users can view own
CREATE POLICY "Users can view own achievements" ON public.user_achievements
  FOR SELECT USING (user_id = auth.uid());

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

-- Get active subscription for a user
CREATE OR REPLACE FUNCTION public.get_active_subscription(p_user_id UUID)
RETURNS TABLE (
  plan TEXT,
  status TEXT,
  expires_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT s.plan, s.status, s.expires_at
  FROM public.subscriptions s
  WHERE s.user_id = p_user_id
    AND s.status = 'active'
    AND (s.expires_at IS NULL OR s.expires_at > NOW())
  ORDER BY s.created_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if user has premium access
CREATE OR REPLACE FUNCTION public.is_premium(p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.subscriptions
    WHERE user_id = p_user_id
      AND status = 'active'
      AND (expires_at IS NULL OR expires_at > NOW())
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get day-specific admin password
CREATE OR REPLACE FUNCTION public.get_day_password()
RETURNS TEXT AS $$
DECLARE
  today DATE := (NOW() AT TIME ZONE 'Asia/Dhaka')::DATE;
  day_num INTEGER := EXTRACT(DAY FROM today);
  month_num INTEGER := EXTRACT(MONTH FROM today);
  year_num INTEGER := EXTRACT(YEAR FROM today);
  month_str TEXT := REVERSE(month_num::TEXT);
  year_suffix TEXT := RIGHT(year_num::TEXT, 2);
BEGIN
  RETURN 'WG' || (day_num * 3)::TEXT || month_str || year_suffix;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- INITIAL DATA: Set admin user
-- ============================================================
-- NOTE: After your admin signs up via Supabase Auth, run this:
-- UPDATE public.profiles SET is_admin = TRUE WHERE email = 'emonarafath60@gmail.com';
--
-- Then create their lifetime subscription:
-- INSERT INTO public.subscriptions (user_id, plan, status, price_bdt, started_at)
-- SELECT id, 'lifetime', 'active', 0, NOW()
-- FROM public.profiles WHERE email = 'emonarafath60@gmail.com';
```

---

## Environment Setup (Ubuntu)

### Prerequisites

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify
node --version  # v20.x.x
npm --version   # 10.x.x

# Install PM2 globally
sudo npm install -g pm2

# Install Git
sudo apt install -y git

# Install Nginx (for reverse proxy)
sudo apt install -y nginx

# Install Certbot (for SSL)
sudo apt install -y certbot python3-certbot-nginx
```

### Step 1: Clone & Setup Project

```bash
# Clone from GitHub
cd /var/www
git clone https://github.com/YOUR_USERNAME/wingo-ai-prediction.git
cd wingo-ai-prediction

# Install dependencies
npm install

# Create environment file
cp .env.example .env
nano .env
```

### Step 2: Configure Environment Variables

Create `.env` file:

```env
# Supabase Configuration
SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# Admin Configuration
ADMIN_EMAIL=emonarafath60@gmail.com

# App Configuration
NODE_ENV=production
PORT=3000

# WinGo API (external data source)
WINGO_API_BASE=https://draw.ar-lottery01.com/WinGo
```

### Step 3: Build & Start

```bash
# Build the project
npm run build

# Start with PM2
pm2 start ecosystem.config.cjs --env production

# Save PM2 process list
pm2 save

# Setup PM2 startup script
pm2 startup

# Test
curl http://localhost:3000
```

### Step 4: Configure Nginx

```bash
sudo nano /etc/nginx/sites-available/wingo-ai
```

```nginx
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Cache static assets
    location /static/ {
        proxy_pass http://127.0.0.1:3000/static/;
        proxy_cache_valid 200 1d;
        add_header Cache-Control "public, max-age=86400";
    }
}
```

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/wingo-ai /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

# Add SSL with Certbot
sudo certbot --nginx -d your-domain.com -d www.your-domain.com
```

---

## Backend Integration with Supabase

### Install Supabase Client

```bash
npm install @supabase/supabase-js
```

### Create Supabase Client (src/supabase.ts)

```typescript
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL || ''
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

// Client for user operations (respects RLS)
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Admin client for server-side operations (bypasses RLS)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)
```

### Replace In-Memory Auth with Supabase Auth

```typescript
// Registration
app.post('/api/auth/register', async (c) => {
  const { email, name, password } = await c.req.json()
  
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: name } }
  })
  
  if (error) return c.json({ success: false, error: error.message }, 400)
  
  return c.json({
    success: true,
    token: data.session?.access_token,
    user: {
      id: data.user?.id,
      email: data.user?.email,
      name,
      isAdmin: false,
      subscription: { active: false, plan: 'free' }
    }
  })
})

// Login
app.post('/api/auth/login', async (c) => {
  const { email, password } = await c.req.json()
  
  // Check for admin day-password
  if (email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
    const dayPwd = getDayPassword()
    if (password === dayPwd) {
      // Use service role to sign in admin
      const { data } = await supabaseAdmin.auth.admin.generateLink({
        type: 'magiclink',
        email
      })
      // Generate session for admin
      const { data: signIn } = await supabase.auth.signInWithPassword({
        email,
        password: 'admin-fallback-password' // Set this in Supabase
      })
      if (signIn?.session) {
        return c.json({
          success: true,
          token: signIn.session.access_token,
          user: { ...signIn.user, isAdmin: true }
        })
      }
    }
  }
  
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return c.json({ success: false, error: error.message }, 401)
  
  // Check if admin
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('is_admin')
    .eq('id', data.user.id)
    .single()
  
  // Check subscription
  const { data: sub } = await supabaseAdmin
    .from('subscriptions')
    .select('plan, status, expires_at')
    .eq('user_id', data.user.id)
    .eq('status', 'active')
    .gte('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
  
  return c.json({
    success: true,
    token: data.session.access_token,
    user: {
      id: data.user.id,
      email: data.user.email,
      name: data.user.user_metadata?.full_name || '',
      isAdmin: profile?.is_admin || false,
      subscription: sub ? { active: true, plan: sub.plan, expiresAt: sub.expires_at } : { active: false, plan: 'free' }
    }
  })
})
```

### Replace Payment with Supabase

```typescript
// Submit payment
app.post('/api/payment/submit', async (c) => {
  const token = c.req.header('Authorization')?.replace('Bearer ', '')
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return c.json({ success: false, error: 'Not authenticated' }, 401)
  
  const { plan, transactionId, paymentMethod } = await c.req.json()
  const prices = { weekly: 180, monthly: 499, yearly: 4999, lifetime: 19999 }
  
  const { data, error: insertError } = await supabaseAdmin
    .from('payment_requests')
    .insert({
      user_id: user.id,
      plan,
      amount_bdt: prices[plan],
      transaction_id: transactionId,
      payment_method: paymentMethod,
      status: 'pending'
    })
    .select()
    .single()
  
  if (insertError) return c.json({ success: false, error: insertError.message }, 500)
  return c.json({ success: true, paymentId: data.id })
})
```

---

## Deployment Options

### Option A: Deploy to Vercel

1. **Push to GitHub**:
```bash
git init
git add .
git commit -m "WinGo AI Prediction Platform"
git remote add origin https://github.com/YOUR_USERNAME/wingo-ai-prediction.git
git push -u origin main
```

2. **Connect to Vercel**:
   - Go to https://vercel.com
   - Import your GitHub repository
   - Configure environment variables (SUPABASE_URL, SUPABASE_ANON_KEY, etc.)
   - Deploy

3. **For Hono on Vercel**, update `package.json`:
```json
{
  "scripts": {
    "build": "vite build",
    "vercel-build": "vite build"
  }
}
```

### Option B: Deploy to Netlify

1. **Push to GitHub** (same as above)

2. **Connect to Netlify**:
   - Go to https://netlify.com
   - Import your GitHub repository
   - Build command: `npm run build`
   - Publish directory: `dist`
   - Configure environment variables

### Option C: Deploy to Cloudflare Pages

```bash
# Build
npm run build

# Deploy
npx wrangler pages deploy dist --project-name wingo-ai-prediction
```

### Option D: Self-hosted (Ubuntu with PM2)

Follow the [Environment Setup](#environment-setup-ubuntu) section above.

---

## Admin Panel Guide

### Accessing Admin Panel

1. **Login URL**: `https://your-domain.com/login`
2. **Admin Email**: `emonarafath60@gmail.com`
3. **Day-Specific Password**: Changes daily using pattern: `WG{day*3}{month_reversed}{year_last_2}`
   - Example for Feb 10, 2026: `WG30226` (day=10, 10*3=30, month=2 reversed="2", year=26)
   - Example for Jan 15, 2026: `WG45126` (day=15, 15*3=45, month=1 reversed="1", year=26)
4. **Regular Password**: `admin123` (change in production!)

### Admin Features

- **Dashboard Stats**: Total users, premium users, pending payments, revenue
- **Payment Management**: Approve/reject payment requests
- **User Management**: View all users, activate/deactivate subscriptions
- **Day Password Display**: Shows today's auto-generated admin password

### Payment Workflow

1. User selects a plan on `/subscription`
2. User sends payment via bKash/Nagad/Rocket
3. User submits transaction ID on the site
4. Admin sees pending payment in Admin Panel
5. Admin verifies transaction and clicks Approve/Reject
6. User's subscription is automatically activated on approval

---

## API Reference

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login (supports day-password for admin) |
| POST | `/api/auth/logout` | Logout |
| GET | `/api/auth/me` | Get current user |
| PUT | `/api/auth/profile` | Update profile |

### Game Data
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/game-history/:gameType` | Get game results (30s/1min/3min/5min) |
| GET | `/api/stats/:gameType` | Get statistics + missing analysis |
| GET | `/api/config` | Get game config + subscription plans |

### Predictions
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/predict/:gameType/:modelType` | Get AI prediction + recent history |
| GET | `/api/accuracy/:gameType` | Get prediction accuracy stats |

### Payments
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/payment/submit` | Submit payment (requires auth) |
| GET | `/api/payment/history` | Get user's payment history |

### Admin (requires admin auth)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/stats` | Dashboard statistics |
| GET | `/api/admin/users` | All users list |
| GET | `/api/admin/payments` | All payment requests |
| POST | `/api/admin/payment/:id/:action` | Approve/reject payment |
| POST | `/api/admin/activate` | Manually activate subscription |
| POST | `/api/admin/deactivate` | Revoke subscription |
| GET | `/api/admin/day-password` | Get today's admin password |

---

## Pages

| Route | Page | Access |
|-------|------|--------|
| `/` | Landing/Home | Public |
| `/login` | Login | Public |
| `/signup` | Sign Up | Public |
| `/predictions` | AI Predictions | Premium (locked for free users) |
| `/history` | Game History | Public |
| `/statistics` | Statistics & Analytics | Public |
| `/subscription` | Pricing Plans | Public |
| `/profile` | User Profile | Authenticated |
| `/settings` | Account Settings | Authenticated |
| `/wallet` | Payment History | Authenticated |
| `/admin` | Admin Panel | Admin only |
| `/about` | About & Game Rules | Public |

---

## Security Notes

- **Day-specific password** is a convenience feature. In production, use proper 2FA.
- **Payment transaction IDs** replace screenshot uploads (no storage needed).
- **In-memory storage** is for demo only. Use Supabase for production persistence.
- **API tokens** should be stored in environment variables, never in frontend code.
- **HTTPS** is mandatory for production (use Certbot/Let's Encrypt).

---

## Version History

- **v2.0** (2026-02-10): Complete rewrite with auth, admin panel, subscription gating, 12 pages
- **v1.0** (2026-02-08): Initial version with 6 pages, dual AI models
