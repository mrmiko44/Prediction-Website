import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL || ''
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

// Client for user operations (respects RLS)
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Admin client for server-side operations (bypasses RLS)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

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

