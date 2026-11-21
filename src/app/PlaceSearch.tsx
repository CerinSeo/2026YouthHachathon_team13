import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { Place } from '../core/contracts';
import { searchPlaces } from '../services/api';

interface Props {
  field: 'origin' | 'destination';
  onSelect: (place: Place) => void;
  onLocate?: () => void;
  onPick: () => void;
}

export function PlaceSearch({ field, onSelect, onLocate, onPick }: Props) {
  const name = field === 'origin' ? '출발지' : '목적지';
  const [query, setQuery] = useState('');
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [places, setPlaces] = useState<Place[]>([]);
  const active = useRef<AbortController>(null);
  useEffect(() => () => active.current?.abort(), []);

  async function search(term: string) {
    if (!term.trim()) return;
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setQuery(term);
    setPlaces([]);
    setState('loading');
    try {
      setPlaces(await searchPlaces(term.trim(), controller.signal));
      setState('done');
    } catch {
      if (!controller.signal.aborted) setState('error');
    }
  }
  const submit = (event: FormEvent) => { event.preventDefault(); void search(query); };

  return <>
    <form onSubmit={submit} role="search" className="place-search">
      <label htmlFor="place-query">{name} 검색</label>
      <div className="search-field">
        <input id="place-query" type="search" placeholder="장소명이나 주소" value={query} maxLength={80}
          onChange={(event) => setQuery(event.target.value)} />
        <button className="button filled" type="submit" disabled={!query.trim()}>검색</button>
      </div>
    </form>
    <div className="button-row">
      {onLocate && <button className="button outlined" onClick={onLocate}>현재 위치 쓰기</button>}
      <button className="button outlined" onClick={onPick}>지도에서 선택</button>
    </div>
    <div role="status" aria-live="polite" className="search-status">
      {state === 'loading' && <p>장소를 찾고 있어요…</p>}
      {state === 'done' && <p>{places.length ? `검색 결과 ${places.length}곳` : '검색 결과가 없어요. 장소명이나 주소를 다시 확인해 주세요.'}</p>}
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
          <span className="select-word" aria-hidden="true">선택</span>
        </button>
      </li>)}
    </ul>}
    {state === 'idle' && field === 'destination' && <section className="suggestions">
      <h2>추천 장소</h2>
      <div className="button-row">{['관악구청', '서울대학교병원', '마포노인종합복지관'].map((item) =>
        <button key={item} className="button outlined" onClick={() => void search(item)}>{item}</button>)}</div>
    </section>}
  </>;
}
