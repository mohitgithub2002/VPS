import { NextResponse } from 'next/server';
import { supabase } from '@/utils/supabaseClient';

export async function GET() {
  try {
    const { data: types, error } = await supabase
      .from('exam_type')
      .select('name');
    if (error) {
      return NextResponse.json({ success: false, message: 'Failed to fetch exam types' }, { status: 500 });
    }
    const names = (types || []).map(t => t.name);
    return NextResponse.json({ success: true, data: names });
  } catch (err) {
    console.error('Exam types metadata API error:', err);
    return NextResponse.json({ success: false, message: 'Failed to fetch exam types' }, { status: 500 });
  }
} 