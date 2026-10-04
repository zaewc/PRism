import { NextResponse } from 'next/server';
import { workspaceData } from '../../../shared/data';
export async function GET() {
  return NextResponse.json((await workspaceData()).repositories);
}
