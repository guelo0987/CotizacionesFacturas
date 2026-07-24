process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import { createClient } from '@supabase/supabase-js';

const url = 'https://hxeovachlapvfubcebha.supabase.co';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4ZW92YWNobGFwdmZ1YmNlYmhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4ODM0NDcsImV4cCI6MjEwMDQ1OTQ0N30.c-CmCmKcqmTksouDUtPeUg2VbLOvRITydY1WwNy81cA';

const supabase = createClient(url, anonKey);

async function main() {
  console.log('Ensuring yeisito@gmail.com exists in Supabase Auth Cloud...');
  
  // Try Sign Up
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email: 'yeisito@gmail.com',
    password: '123456',
  });

  if (signUpError) {
    console.log('Sign up result:', signUpError.message);
  } else {
    console.log('User signed up / created successfully:', signUpData.user?.id);
  }

  // Try Sign In with Password
  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email: 'yeisito@gmail.com',
    password: '123456',
  });

  if (signInError) {
    console.error('Sign in error:', signInError.message);
  } else {
    console.log('✅ Sign in successful against live Supabase Auth!');
    console.log('User ID:', signInData.user?.id);
    console.log('JWT Token:', signInData.session?.access_token?.substring(0, 30) + '...');
  }
}

main();
