import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { Place } from '../core/contracts';
import { searchPlaces } from '../services/api';

interface Props {
  field: 'origin' | 'destination';
  onSelect: (place: Place) => void;
  onPick: () => void;
}

export function PlaceSearch({ field, onSelect, onPick }: Props) {
  const name = field === 'origin' ? '출발지' : '목적지';
  const [query, setQuery] = useState('');
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [places, setPlaces] = useState<Place[]>([]);
  const active = useRef<AbortController>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
    return () => active.current?.abort();
  }, []);

  async function search(term: string) {
    if (!term.trim()) return;
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setQuery(term);
    setPlaces([]);
    setState('loading');
    try {
      const matches = await searchPlaces(term.trim(), controller.signal);
      if (controller.signal.aborted) return;
      setPlaces(matches);
      setState('done');
    } catch {
      if (!controller.signal.aborted) setState('error');
    }
  }
  const submit = (event: FormEvent) => { event.preventDefault(); void search(query); };

  function changeQuery(value: string) {
    active.current?.abort();
    setQuery(value);
    setPlaces([]);
    setState('idle');
  }

  return <>
    <form onSubmit={submit} role="search" className="place-search">
      <label className="sr-only" htmlFor="place-query">{name} 검색</label>
      <div className="search-field">
        <div className="search-entry">
          <span className="search-glyph" aria-hidden="true" />
          <input ref={input} id="place-query" type="search" placeholder="장소 이름 또는 주소" value={query} maxLength={80}
            onChange={(event) => changeQuery(event.target.value)} />
          {query && <button type="button" className="button icon" aria-label="검색어 지우기"
            onClick={() => { changeQuery(''); input.current?.focus(); }}>×</button>}
        </div>
        <button className="button filled" type="submit" disabled={!query.trim()}>검색</button>
      </div>
    </form>
    <div className="search-shortcuts">
      <button className="button outlined" onClick={onPick}>지도에서 선택</button>
    </div>
    <div role="status" aria-live="polite" className="search-status">
      {state === 'loading' && <p>장소를 찾고 있어요…</p>}
      {state === 'done' && (places.length
        ? <p className="sr-only">{`검색 결과 ${places.length}곳`}</p>
        : <p>검색 결과가 없어요. 다른 이름이나 주소를 입력해 주세요.</p>)}
    </div>
    {state === 'error' && <div role="alert" className="notice error">
      <p>장소를 검색하지 못했어요. 다시 시도하거나 지도에서 선택해 주세요.</p>
      <button className="button outlined" onClick={() => void search(query)}>다시 검색하기</button>
    </div>}
    {places.length > 0 && <ul className="place-list" aria-label="검색 결과">
      {places.map((place) => <li key={place.id}>
        <button onClick={() => onSelect(place)}>
          <span className="list-mark" aria-hidden="true">⌖</span>
          <span><strong>{place.name}</strong>{place.address && <small>{place.address}</small>}</span>
          <span aria-hidden="true" className="place-select">›</span>
        </button>
      </li>)}
    </ul>}
  </>;
}
