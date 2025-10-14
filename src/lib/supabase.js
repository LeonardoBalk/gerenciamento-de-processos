import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://vneroqspauftvaaodffu.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZuZXJvcXNwYXVmdHZhYW9kZmZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY0MDU0ODEsImV4cCI6MjA3MTk4MTQ4MX0.mSuPZLM3-MglsEiv6tcDJPd81Fl_M2OFi7CbLIZuKhA'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
