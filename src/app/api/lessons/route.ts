import { NextResponse } from 'next/server';
import { handle } from '@/lib/http';
import { lessonSummaries } from '@/lib/generations';

export const dynamic = 'force-dynamic';

export const GET = handle(() => NextResponse.json({ lessons: lessonSummaries() }));
