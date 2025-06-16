import { NextResponse } from 'next/server';
import { supabase } from '@/utils/supabaseClient';

export async function GET() {
  try {
    const { data: subjects, error } = await supabase
      .from('subject')
      .select('name');
    if (error) {
      return NextResponse.json({ success: false, message: 'Failed to fetch subjects' }, { status: 500 });
    }
    const names = (subjects || []).map(s => s.name);
    return NextResponse.json({ success: true, data: names });
  } catch (err) {
    console.error('Subjects metadata API error:', err);
    return NextResponse.json({ success: false, message: 'Failed to fetch subjects' }, { status: 500 });
  }
} 