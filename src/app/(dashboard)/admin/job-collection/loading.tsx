export default function AdminJobCollectionLoading() {
  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16 animate-pulse">
      <div className="bg-white p-6 rounded-[16px] border border-[#E5EAE7] shadow-2xs space-y-4">
        <div className="h-6 bg-slate-200 rounded w-1/4"></div>
        <div className="h-4 bg-slate-100 rounded w-1/2"></div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 pt-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-16 bg-slate-100 rounded-xl"></div>
          ))}
        </div>
      </div>
      <div className="bg-white p-6 rounded-[16px] border border-[#E5EAE7] h-64"></div>
    </div>
  );
}
