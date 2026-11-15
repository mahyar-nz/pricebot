/** Calendar-day boundary for the business timezone, independent of server timezone. */
export function tehranDayStart(now: Date): Date {
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit',timeZoneName:'longOffset'}).formatToParts(now);
  const get=(type:string)=>parts.find(p=>p.type===type)!.value;
  const offset=/GMT([+-])(\d{2}):(\d{2})/.exec(get('timeZoneName'));
  if(!offset) throw new Error('Unsupported Tehran timezone offset');
  const minutes=(Number(offset[2])*60+Number(offset[3]))*(offset[1]==='+'?1:-1);
  return new Date(Date.UTC(Number(get('year')),Number(get('month'))-1,Number(get('day')))-minutes*60000);
}
