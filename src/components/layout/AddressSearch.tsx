import { MapPin, Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { searchAddresses } from '../../services/geocoding';
import type { AddressResult } from '../../services/geocoding';

export function AddressSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AddressResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [active, setActive] = useState(-1);
  const form = useRef<HTMLFormElement>(null);
  const request = useRef<AbortController | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !form.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => { request.current?.abort(); document.removeEventListener('pointerdown', closeOutside); };
  }, []);

  function choose(result: AddressResult) {
    setQuery(result.label);
    setOpen(false);
    navigate(`/map${location.pathname === '/map' ? location.search : ''}`, { state: { mapTarget: result } });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (open && active >= 0 && results[active]) { choose(results[active]); return; }
    if (query.trim().length < 3) { setMessage('Digite pelo menos 3 caracteres. Inclua a cidade para refinar a busca.'); setOpen(true); return; }
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const timeout = window.setTimeout(() => controller.abort('timeout'), 12000);
    setOpen(true); setLoading(true); setMessage(''); setResults([]); setActive(-1);
    try {
      const found = await searchAddresses(query, controller.signal);
      if (controller.signal.aborted) return;
      setResults(found);
      if (!found.length) setMessage('Nenhum endereço encontrado. Tente incluir o número e a cidade.');
      if (found.length === 1) choose(found[0]);
    } catch {
      if (request.current !== controller) return;
      if (!controller.signal.aborted || controller.signal.reason === 'timeout') {
        setMessage('Não foi possível buscar agora. Confira sua conexão e tente novamente.');
      }
    } finally {
      window.clearTimeout(timeout);
      if (request.current === controller) setLoading(false);
    }
  }

  return <form ref={form} className="search address-search" role="search" onSubmit={submit}>
    <MapPin size={17} aria-hidden="true"/>
    <input aria-label="Buscar local" placeholder="Buscar endereço ou ponto de interesse..." value={query}
      role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls="address-results"
      aria-activedescendant={active >= 0 ? `address-result-${active}` : undefined}
      onFocus={() => { if (results.length || message) setOpen(true); }}
      onChange={event => { request.current?.abort(); setLoading(false); setQuery(event.target.value); setResults([]); setMessage(''); setActive(-1); setOpen(false); }}
      onKeyDown={event => {
        if (event.key === 'Escape') { setOpen(false); setActive(-1); }
        if (results.length && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
          event.preventDefault(); setOpen(true);
          setActive(index => (index + (event.key === 'ArrowDown' ? 1 : results.length - 1) + results.length) % results.length);
        }
      }}/>
    {query && <button type="button" className="search-action" aria-label="Limpar busca" onClick={() => { request.current?.abort(); setQuery(''); setResults([]); setOpen(false); setLoading(false); setActive(-1); setMessage(''); }}><X size={15}/></button>}
    <button type="submit" className="search-action" aria-label="Pesquisar endereço" disabled={loading}><Search size={18}/></button>
    {open && <div className="address-dropdown">
      {loading && <p role="status">Buscando endereços…</p>}
      {message && <p role="status">{message}</p>}
      <ul id="address-results" role="listbox" aria-label="Endereços encontrados">
        {results.map((result, index) => <li key={`${result.lng}:${result.lat}:${index}`} id={`address-result-${index}`} role="option" aria-selected={index === active}>
          <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => choose(result)}><MapPin size={16}/><span>{result.label}</span></button>
        </li>)}
      </ul>
      <small>Endereços: Photon / OpenStreetMap</small>
    </div>}
  </form>;
}
