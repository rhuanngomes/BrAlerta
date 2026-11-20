import { Camera, Check, MapPin, X } from 'lucide-react';
import { useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import type { IncidentCategory, IncidentInput } from '../../types';

type Coordinates = { lat: number; lng: number };

type IncidentFormProps = {
  initialCategory?: IncidentCategory;
  category?: IncidentCategory;
  onCategoryChange?: (category: IncidentCategory) => void;
  coords: Coordinates | null;
  onCancel: () => void;
  onSubmit: (value: IncidentInput) => Promise<void>;
};

const photoTypes = ['image/jpeg', 'image/png', 'image/webp'];
const maxPhotoSize = 5 * 1024 * 1024;

export function IncidentForm({
  initialCategory = 'STREETLIGHT',
  category: selectedCategory,
  onCategoryChange,
  coords,
  onCancel,
  onSubmit,
}: IncidentFormProps) {
  const [draftCategory, setDraftCategory] = useState<IncidentCategory>(initialCategory);
  const category = selectedCategory ?? draftCategory;
  const setCategory = (nextCategory: IncidentCategory) => {
    if (selectedCategory === undefined) setDraftCategory(nextCategory);
    onCategoryChange?.(nextCategory);
  };
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [photo, setPhoto] = useState<string>();
  const [photoFile, setPhotoFile] = useState<File>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function selectPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;

    if (!photoTypes.includes(file.type)) {
      setError('Use uma imagem JPG, PNG ou WebP.');
      return;
    }

    if (file.size > maxPhotoSize) {
      setError('Escolha uma imagem de até 5 MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        setError('Não foi possível carregar a imagem selecionada.');
        return;
      }

      setPhotoFile(file);
      setPhoto(reader.result);
      setError('');
    };
    reader.onerror = () => setError('Não foi possível ler a imagem selecionada.');
    reader.readAsDataURL(file);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!coords) {
      setError('Clique no mapa para indicar o local.');
      return;
    }

    if (!title.trim() || !description.trim()) {
      setError('Preencha título e descrição.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await onSubmit({
        category,
        title: title.trim(),
        description: description.trim(),
        latitude: coords.lat,
        longitude: coords.lng,
        photoUrl: photo,
        photoFile,
      });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível publicar a ocorrência.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <aside className="form-panel">
      <button className="close" onClick={onCancel} aria-label="Cancelar registro">
        <X />
      </button>
      <span className="eyebrow">NOVA OCORRÊNCIA</span>
      <h2>Registrar ocorrência</h2>
      <p>Selecione a categoria, marque o local no mapa e conte o que aconteceu.</p>

      <form onSubmit={submit}>
        <fieldset>
          <legend>Categoria</legend>
          <div className="category-options">
            <button
              type="button"
              className={category === 'STREETLIGHT' ? 'selected' : ''}
              aria-pressed={category === 'STREETLIGHT'}
              onClick={() => setCategory('STREETLIGHT')}
            >
              <span aria-hidden="true">💡</span>
              <b>Poste apagado</b>
              {category === 'STREETLIGHT' && <Check aria-hidden="true" />}
            </button>
            <button
              type="button"
              className={category === 'POTHOLE' ? 'selected' : ''}
              aria-pressed={category === 'POTHOLE'}
              onClick={() => setCategory('POTHOLE')}
            >
              <span aria-hidden="true">⚠️</span>
              <b>Buraco na rua</b>
              {category === 'POTHOLE' && <Check aria-hidden="true" />}
            </button>
            <button
              type="button"
              className={category === 'FLOOD' ? 'selected' : ''}
              aria-pressed={category === 'FLOOD'}
              onClick={() => setCategory('FLOOD')}
            >
              <span aria-hidden="true">🌊</span>
              <b>Rua alagada</b>
              {category === 'FLOOD' && <Check aria-hidden="true" />}
            </button>
            <button
              type="button"
              className={category === 'SAFETY' ? 'selected' : ''}
              aria-pressed={category === 'SAFETY'}
              onClick={() => setCategory('SAFETY')}
            >
              <span aria-hidden="true">🛡️</span>
              <b>Segurança</b>
              {category === 'SAFETY' && <Check aria-hidden="true" />}
            </button>
            <button type="button" className={category === 'TRAFFIC' ? 'selected' : ''}
              aria-pressed={category === 'TRAFFIC'} onClick={() => setCategory('TRAFFIC')}>
              <span aria-hidden="true">🚗</span><b>Trânsito intenso</b>
              {category === 'TRAFFIC' && <Check aria-hidden="true" />}
            </button>
          </div>
        </fieldset>

        <div className={`location-box ${coords ? 'done' : ''}`}>
          <MapPin aria-hidden="true" />
          <div>
            <b>{coords ? 'Local selecionado' : 'Indique o local no mapa'}</b>
            <span>
              {coords
                ? `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`
                : 'Clique no ponto exato do problema'}
            </span>
          </div>
        </div>

        <label>
          Título
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Ex.: Poste apagado próximo à praça"
            maxLength={80}
          />
        </label>

        <label>
          Descrição
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Descreva o problema com mais detalhes..."
            maxLength={300}
          />
          <small>{description.length}/300</small>
        </label>

        <label className="photo-input">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={selectPhoto}
          />
          <Camera aria-hidden="true" />
          <b>{photo ? 'Foto pronta' : 'Adicionar foto'}</b>
          <span>JPG, PNG ou WebP · até 5 MB</span>
        </label>

        {photo && <img className="photo-preview" src={photo} alt="Prévia selecionada" />}
        {error && <div className="form-error" role="alert">{error}</div>}

        <button className="primary" disabled={saving}>
          {saving ? 'Publicando...' : 'Publicar ocorrência'} <span aria-hidden="true">→</span>
        </button>
      </form>
    </aside>
  );
}
