import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes, useNavigate, useParams } from 'react-router'
import * as THREE from 'three'
import './styles.css'

const API = import.meta.env.VITE_API_URL || '/api'
const AuthContext = createContext(null)
const platforms = {
  GBA: { name: 'Game Boy Advance', short: 'GBA', accent: '#8c73ff', className: 'gba', line: '32-bit / portátil / 2001' },
  SWITCH: { name: 'Nintendo Switch', short: 'NSW', accent: '#ff4864', className: 'switch', line: 'híbrido / dock / 2017' },
  N3DS: { name: 'Nintendo 3DS', short: '3DS', accent: '#3ec6ff', className: 'n3ds', line: 'dual screen / 3D / 2011' }
}
const demo = [
  { id:'g1', title:'Pokémon Emerald', platform:'GBA', releaseYear:2004, coverUrl:'/previews/pokemon/gba/emerald-gba.jpg', fileSize:16777216 },
  { id:'g2', title:'Pokémon FireRed', platform:'GBA', releaseYear:2004, coverUrl:'/previews/pokemon/gba/firered-gba.jpg', fileSize:16777216 },
  { id:'g3', title:'Metroid Fusion', platform:'GBA', releaseYear:2002, coverUrl:'/previews/metroid/metroid-gba.jpg', fileSize:8388608 },
  { id:'s1', title:'Breath of the Wild', platform:'SWITCH', releaseYear:2017, coverUrl:null, fileSize:14763950080 },
  { id:'s2', title:'Mario Kart 8 Deluxe', platform:'SWITCH', releaseYear:2017, coverUrl:'/previews/mario/deluxe8-switch.jpg', fileSize:7516192768 },
  { id:'s3', title:'Hollow Knight', platform:'SWITCH', releaseYear:2018, coverUrl:null, fileSize:3670016000 },
  { id:'n1', title:'Pokémon Platinum', platform:'N3DS', releaseYear:2008, coverUrl:'/previews/pokemon/platinum/platinum-3ds.jpg', fileSize:268435456 },
  { id:'n2', title:'Pokémon SoulSilver', platform:'N3DS', releaseYear:2009, coverUrl:'/previews/pokemon/platinum/soulsilver-3ds.jpg', fileSize:268435456 },
  { id:'n3', title:'Pokémon White', platform:'N3DS', releaseYear:2010, coverUrl:'/previews/pokemon/platinum/white-3ds.jpg', fileSize:536870912 }
]

async function request(path, options = {}) {
  const token = localStorage.getItem('arcadia_token')
  const response = await fetch(`${API}${path}`, { ...options, headers: { ...(options.body instanceof FormData ? {} : { 'Content-Type':'application/json' }), ...(token ? { Authorization:`Bearer ${token}` } : {}), ...options.headers } })
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).message || 'Não foi possível completar a ação.')
  if (response.status === 204) return null
  return response.json()
}

function AuthProvider({ children }) {
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('arcadia_user') || 'null'))
  const save = data => { localStorage.setItem('arcadia_token', data.token); localStorage.setItem('arcadia_user', JSON.stringify(data.user)); setUser(data.user) }
  const logout = () => { localStorage.removeItem('arcadia_token'); localStorage.removeItem('arcadia_user'); setUser(null) }
  return <AuthContext.Provider value={{ user, save, logout }}>{children}</AuthContext.Provider>
}
const useAuth = () => useContext(AuthContext)

function AmbientScene() {
  useEffect(() => {
    const canvas = document.querySelector('#ambient-canvas')
    if (!canvas) return
    const renderer = new THREE.WebGLRenderer({ canvas, alpha:true, antialias:true })
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, 1, .1, 100)
    camera.position.z = 6
    const geometry = new THREE.IcosahedronGeometry(1.45, 1)
    const material = new THREE.MeshBasicMaterial({ color:0x8c73ff, wireframe:true, transparent:true, opacity:.13 })
    const mesh = new THREE.Mesh(geometry, material)
    scene.add(mesh)
    let frame
    const resize = () => { renderer.setSize(canvas.clientWidth, canvas.clientHeight, false); camera.aspect = canvas.clientWidth / canvas.clientHeight; camera.updateProjectionMatrix() }
    const tick = () => { resize(); mesh.rotation.x += .0018; mesh.rotation.y += .0026; renderer.render(scene, camera); frame = requestAnimationFrame(tick) }
    tick()
    return () => { cancelAnimationFrame(frame); geometry.dispose(); material.dispose(); renderer.dispose() }
  }, [])
  return <canvas id="ambient-canvas" aria-hidden="true" />
}

function Header() {
  const { user, logout } = useAuth()
  return <header className="header">
    <a className="brand" href="/"><span className="brand-mark">A</span><span>ARCADIA<small>VAULT</small></span></a>
    <nav aria-label="Navegação principal">
      <a href="/#systems">Sistemas</a><a href="/#about">Sobre</a>
      {user?.role === 'ADMIN' && <a href="/admin" className="admin-link">Painel admin</a>}
    </nav>
    <div className="header-actions">
      {user ? <><span className="user-chip">{user.fullName?.split(' ')[0]} · {user.role}</span><button className="ghost" onClick={logout}>Sair</button></> : <a className="ghost" href="/login">Entrar</a>}
    </div>
  </header>
}

function Home() {
  return <><Header/><main>
    <section className="hero">
      <AmbientScene/>
      <div className="eyebrow"><i/> ARQUIVO DIGITAL · BETA 0.1</div>
      <h1>Seu próximo jogo<br/><em>começa aqui.</em></h1>
      <p>Uma biblioteca feita para preservar, organizar e redescobrir clássicos. Escolha seu sistema e entre no jogo.</p>
      <a className="primary" href="#systems">EXPLORAR BIBLIOTECA <span>↓</span></a>
      <div className="hero-stats"><div><b>03</b><small>SISTEMAS</small></div><div><b>09</b><small>TÍTULOS BETA</small></div><div><b>24/7</b><small>ONLINE</small></div></div>
    </section>
    <section className="systems" id="systems">
      <div className="section-heading"><div><span>01 / SISTEMAS</span><h2>Escolha seu console</h2></div><p>Cada biblioteca assume a identidade do hardware original — navegue como se o console estivesse em suas mãos.</p></div>
      <div className="system-grid">
        {Object.entries(platforms).map(([key,p], index) => <a href={`/console/${key}`} className={`system-card ${p.className}`} key={key}>
          <div className="card-index">0{index+1}</div><ConsoleArt type={key}/><div className="card-copy"><small>{p.short}</small><h3>{p.name}</h3><p>{p.line}</p></div><span className="arrow">↗</span>
        </a>)}
      </div>
    </section>
    <section className="about" id="about"><span>ARCADIA MANIFESTO</span><p>Jogos são memória. O Vault organiza sua coleção pessoal com uma experiência que respeita cada geração.</p><small>Use apenas cópias de jogos que você tem direito legal de armazenar.</small></section>
  </main><Footer/></>
}

function ConsoleArt({ type }) {
  if (type === 'GBA') return <div className="console-art gba-art"><div className="screen">GAME BOY<br/><b>ADVANCE</b></div><i/><i/><span>••••••</span></div>
  if (type === 'SWITCH') return <div className="console-art switch-art"><i/><div className="screen"><b>+</b><b>−</b></div><i/></div>
  return <div className="console-art ds-art"><div/><span/><div/></div>
}

function ConsolePage() {
  const { platform } = useParams()
  const p = platforms[platform] || platforms.GBA
  const [games,setGames] = useState(demo.filter(g => g.platform === platform))
  const [selected,setSelected] = useState(0)
  const [downloadState,setDownloadState] = useState({ loading:false, message:'' })
  const { user } = useAuth()
  useEffect(() => { request(`/roms?platform=${platform}`).then(items => items.length && setGames(items)).catch(() => {}) }, [platform])
  const game = games[selected]
  const download = async () => {
    if (!user) return location.assign('/login')
    if (String(game.id).length < 10) return alert('Este é um item demonstrativo. O arquivo estará disponível após o seed e upload administrativo.')
    if (game.available === false) {
      return setDownloadState({
        loading:false,
        message:'A ROM ainda não foi enviada. Use o painel administrativo para anexar o arquivo.'
      })
    }
    const token = localStorage.getItem('arcadia_token')
    setDownloadState({ loading:true, message:'' })
    try {
      const response = await fetch(`${API}/roms/${game.id}/download`, {
        headers: { Authorization:`Bearer ${token}` }
      })
      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || 'Não foi possível baixar o arquivo.')
      }
      const blob = await response.blob()
      const disposition = response.headers.get('Content-Disposition') || ''
      const encodedName = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
      const plainName = disposition.match(/filename="?([^";]+)"?/i)?.[1]
      const fileName = encodedName ? decodeURIComponent(encodedName) : plainName || game.fileName || `${game.title}.zip`
      const objectUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(objectUrl)
      setDownloadState({ loading:false, message:'Download iniciado.' })
    } catch (error) {
      setDownloadState({ loading:false, message:error.message })
    }
  }
  const gameMenu = <aside className="console-library"><small>JOGOS</small>{games.map((g,i) => <button key={g.id} className={selected===i?'active':''} onClick={()=>setSelected(i)}><span>0{i+1}</span>{g.title}</button>)}</aside>
  const gameDetails = game && <section className="game-focus">
    <div className="game-cover" style={game.coverUrl ? {backgroundImage:`url(${game.coverUrl})`} : {}}><span>{p.short}</span>{!game.coverUrl && <b>{game.title}</b>}</div>
    <div className="game-info"><span className="tag">{platform}</span><h2>{game.title}</h2><p>Selecionado da coleção Arcadia. Pronto para adicionar à sua biblioteca pessoal.</p><dl><div><dt>ANO</dt><dd>{game.releaseYear || '—'}</dd></div><div><dt>TAMANHO</dt><dd>{formatBytes(game.fileSize)}</dd></div><div><dt>STATUS</dt><dd>{game.available===false?'SEM ARQUIVO':'DISPONÍVEL'}</dd></div></dl><button className="primary" onClick={download} disabled={downloadState.loading||game.available===false}>{downloadState.loading?'PREPARANDO...':game.available===false?'ARQUIVO NÃO ENVIADO':'BAIXAR ARQUIVO'} <span>↓</span></button>{downloadState.message&&<div className="download-message">{downloadState.message}</div>}</div>
  </section>
  return <div className={`console-page ${p.className}`}><Header/><main className="console-shell">
    <a href="/#systems" className="back">← VOLTAR AOS SISTEMAS</a>
    <div className="console-title"><div><span>{p.short} / BIBLIOTECA</span><h1>{p.name}</h1></div><div className="online"><i/> SISTEMA ONLINE</div></div>
    {platform === 'SWITCH' && <div className="switch-device">
      <div className="joycon joycon-left"><i className="minus"/><i className="stick"/><i className="d-buttons"/><i className="capture"/></div>
      <div className="switch-tablet"><div className="device-top"><span>NINTENDO SWITCH</span><small>{games.length} JOGOS INSTALADOS · 100% ◒</small></div><div className="device-screen">{gameMenu}{gameDetails}</div><div className="switch-homebar"><i/></div></div>
      <div className="joycon joycon-right"><i className="plus"/><i className="face-buttons">A<br/>B</i><i className="stick"/><i className="home"/></div>
    </div>}
    {platform === 'GBA' && <div className="gba-device">
      <div className="gba-shoulders"><span>L</span><span>R</span></div><div className="gba-logo">GAME BOY <b>ADVANCE</b></div>
      <div className="gba-body"><div className="gba-dpad"><i/><i/></div><div className="gba-screen-bezel"><div className="power-led">POWER <i/></div><div className="device-screen">{gameMenu}{gameDetails}</div><small>GAME BOY ADVANCE</small></div><div className="gba-actions"><button>A</button><button>B</button></div></div>
      <div className="gba-bottom"><span>SELECT</span><i/><span>START</span><i/><b>••••••</b></div>
    </div>}
    {platform === 'N3DS' && <div className="ds-device">
      <div className="ds-lid"><div className="ds-camera"/><div className="ds-upper-screen">{game && <><div className="ds-hero-cover" style={game.coverUrl?{backgroundImage:`url(${game.coverUrl})`}:{}}/><div><small>SOFTWARE SELECIONADO</small><h2>{game.title}</h2><p>{game.releaseYear} · {formatBytes(game.fileSize)}</p></div></>}</div><span className="ds-speaker left">••••••</span><span className="ds-speaker right">••••••</span></div>
      <div className="ds-hinge"><i/><span>NINTENDO 3DS</span><i/></div>
      <div className="ds-base"><div className="ds-side-controls"><i className="circle-pad"/><i className="ds-dpad"/></div><div className="ds-touch-screen"><div className="device-screen">{gameMenu}{gameDetails}</div></div><div className="ds-side-controls right"><i className="ds-abxy">X<br/>Y&nbsp;&nbsp;A<br/>B</i><i className="ds-home">⌂</i></div></div>
      <div className="ds-status"><i/> POWER <span>SELECT</span><span>HOME</span><span>START</span></div>
    </div>}
  </main></div>
}
const formatBytes = n => !n ? '—' : n > 1e9 ? `${(n/1e9).toFixed(1)} GB` : `${Math.round(n/1e6)} MB`

function AuthPage() {
  const [mode,setMode] = useState('login')
  const [form,setForm] = useState({})
  const [challenge,setChallenge] = useState(null)
  const [message,setMessage] = useState('')
  const [loading,setLoading] = useState(false)
  const { save } = useAuth()
  const navigate = useNavigate()
  const change = e => setForm({...form,[e.target.name]:e.target.value})
  const cep = async e => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const value = String(form.cep||'').replace(/\D/g,'')
    if (value.length !== 8) return setMessage('Digite um CEP com 8 números.')
    try {
      const data = await fetch(`https://viacep.com.br/ws/${value}/json/`).then(r=>r.json())
      if (data.erro) throw new Error()
      setForm(f=>({...f,cep:value,street:data.logradouro,district:data.bairro,city:data.localidade,state:data.uf}))
      setMessage('Endereço localizado. Complete o número.')
    } catch { setMessage('CEP não encontrado. Preencha o endereço manualmente.') }
  }
  const submit = async e => {
    e.preventDefault(); setLoading(true); setMessage('')
    try {
      if (mode === 'forgot') {
        const data = await request('/auth/forgot-password',{method:'POST',body:JSON.stringify({email:form.email})})
        return setMessage(data.message)
      }
      if (mode === 'mfa') {
        const data = await request('/auth/login/mfa/verify',{method:'POST',body:JSON.stringify({challengeId:challenge.challengeId,code:form.code})})
        save(data)
        return navigate(data.user.role==='ADMIN'?'/admin':'/')
      }
      const data = await request(`/auth/${mode}`,{method:'POST',body:JSON.stringify(form)})
      if (data.requiresMfa) {
        setChallenge(data)
        setForm({})
        setMode('mfa')
        return setMessage(`Código enviado para ${data.email}.`)
      }
      save(data)
      navigate(data.user.role==='ADMIN'?'/admin':'/')
    }
    catch(err){ setMessage(err.message) } finally { setLoading(false) }
  }
  const title = mode==='login'?'READY?':mode==='register'?'NEW PLAYER':mode==='mfa'?'CHECKPOINT':'RECOVER'
  const subtitle = mode==='login'?'Entre para liberar seus downloads.':mode==='register'?'Crie seu cartão de acesso ao Vault.':mode==='mfa'?`Digite o código de 6 dígitos enviado para ${challenge?.email||'seu e-mail'}.`:'Enviaremos um link de redefinição válido por 30 minutos.'
  return <div className="auth-page"><AmbientScene/><a className="brand auth-brand" href="/"><span className="brand-mark">A</span><span>ARCADIA<small>VAULT</small></span></a>
    <div className="arcade"><div className="marquee">PLAYER <em>{mode==='login'?'ONE':mode==='mfa'?'VERIFY':mode==='forgot'?'RESET':'NEW'}</em></div><div className="arcade-screen">
      <span className="insert">● SECURE ACCESS TERMINAL</span><h1>{title}</h1><p>{subtitle}</p>
      <form onSubmit={submit}>
        {mode==='register' && <><Field label="NOME COMPLETO" name="fullName" value={form.fullName} onChange={change}/><div className="form-row"><Field label="CPF" name="cpf" value={form.cpf} onChange={change}/><Field label="CEP · ENTER PARA BUSCAR" name="cep" value={form.cep} onChange={change} onKeyDown={cep}/></div></>}
        {mode!=='mfa' && <Field label="E-MAIL" name="email" type="email" value={form.email} onChange={change}/>}
        {(mode==='login'||mode==='register') && <Field label="SENHA" name="password" type="password" value={form.password} onChange={change}/>}
        {mode==='mfa' && <Field label="CÓDIGO MFA" name="code" inputMode="numeric" pattern="[0-9]{6}" maxLength="6" autoComplete="one-time-code" value={form.code} onChange={change}/>}
        {mode==='register' && <><div className="form-row"><Field label="RUA" name="street" value={form.street} onChange={change}/><Field label="NÚMERO" name="number" value={form.number} onChange={change}/></div><div className="form-row"><Field label="BAIRRO" name="district" value={form.district} onChange={change}/><Field label="CIDADE" name="city" value={form.city} onChange={change}/><Field label="UF" name="state" value={form.state} onChange={change}/></div><Field label="COMPLEMENTO (OPCIONAL)" name="complement" value={form.complement} onChange={change}/></>}
        {message && <div className="form-message">{message}</div>}<button className="primary auth-submit" disabled={loading}>{loading?'CARREGANDO...':mode==='login'?'PRESS START →':mode==='register'?'CRIAR JOGADOR →':mode==='mfa'?'VALIDAR CÓDIGO →':'ENVIAR LINK →'}</button>
      </form>
      {mode==='login'&&<button className="mode-switch" onClick={()=>{setMode('forgot');setMessage('')}}>ESQUECI MINHA SENHA</button>}
      <button className="mode-switch" onClick={()=>{setMode(mode==='login'?'register':'login');setChallenge(null);setForm({});setMessage('')}}>{mode==='login'?'Ainda não joga? CRIAR CONTA':'VOLTAR AO LOGIN'}</button>
    </div><div className="arcade-controls"><i/><span/><span/></div></div>
  </div>
}

function ResetPasswordPage() {
  const token = new URLSearchParams(location.search).get('token') || ''
  const [password,setPassword] = useState('')
  const [confirmPassword,setConfirmPassword] = useState('')
  const [message,setMessage] = useState('')
  const [done,setDone] = useState(false)
  const [loading,setLoading] = useState(false)
  const submit = async e => {
    e.preventDefault()
    if (password !== confirmPassword) return setMessage('As senhas não coincidem.')
    setLoading(true); setMessage('')
    try {
      const data = await request('/auth/reset-password',{method:'POST',body:JSON.stringify({token,password})})
      setMessage(data.message); setDone(true)
    } catch(error) {
      setMessage(error.message)
    } finally {
      setLoading(false)
    }
  }
  return <div className="auth-page"><AmbientScene/><a className="brand auth-brand" href="/"><span className="brand-mark">A</span><span>ARCADIA<small>VAULT</small></span></a><div className="arcade"><div className="marquee">PASSWORD <em>RESET</em></div><div className="arcade-screen"><span className="insert">● SECURE RECOVERY TERMINAL</span><h1>NEW KEY</h1><p>Defina uma senha com ao menos 8 caracteres, maiúscula, minúscula e número.</p>{!done?<form onSubmit={submit}><Field label="NOVA SENHA" type="password" value={password} onChange={e=>setPassword(e.target.value)}/><Field label="CONFIRMAR SENHA" type="password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)}/>{message&&<div className="form-message">{message}</div>}<button className="primary auth-submit" disabled={loading||!token}>{loading?'SALVANDO...':'REDEFINIR SENHA →'}</button></form>:<><div className="form-message success">{message}</div><a className="primary auth-submit" href="/login">IR PARA O LOGIN →</a></>}</div><div className="arcade-controls"><i/><span/><span/></div></div></div>
}
function Field({ label, value, ...props }) {
  const controlledValue = props.onChange ? { value: value ?? '' } : {}
  return <label className="field"><span>{label}</span><input required={!label.includes('OPCIONAL')} {...props} {...controlledValue}/></label>
}

function AdminAccessDenied() {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const changeAccount = () => {
    logout()
    navigate('/login')
  }
  return <div className="denied-page"><Header/><main><div className="denied-card"><span>ERRO 403 · ACESSO RESTRITO</span><h1>Credencial administrativa necessária.</h1><p>Esta sessão pertence a um usuário comum. Entre com uma conta que tenha o perfil <code>ADMIN</code> para gerenciar ou enviar ROMs.</p><button className="primary" onClick={changeAccount}>ENTRAR COM OUTRA CONTA <b>→</b></button><a href="/" className="ghost">VOLTAR AO INÍCIO</a></div></main></div>
}

function AdminPage() {
  const { user } = useAuth()
  const [items,setItems] = useState([])
  const [message,setMessage] = useState('')
  const refresh = () => request('/roms').then(setItems).catch(e=>setMessage(e.message))
  useEffect(refresh,[])
  if (!user) return <Navigate to="/login"/>
  if (user.role !== 'ADMIN') return <AdminAccessDenied/>
  const remove = async id => { if (!confirm('Remover esta ROM do catálogo?')) return; await request(`/roms/${id}`,{method:'DELETE'}); refresh() }
  return <div className="admin-page"><Header/><main><div className="admin-head"><span>ACESSO NÍVEL 9</span><h1>Controle do Vault</h1><p>Gerencie o catálogo e envie arquivos para as bibliotecas de cada emulador.</p><a className="primary" href="/admin/upload">NOVA ROM <span>＋</span></a></div>
    <div className="admin-catalog"><section className="admin-panel library"><div className="panel-title"><h2>Catálogo</h2><span>{items.length} ITENS</span></div>{message&&<div className="form-message">{message}</div>}{items.map(item=><div className="admin-item" key={item.id}>{item.coverUrl?<img className="admin-cover" src={item.coverUrl} alt=""/>:<div className={`mini-cover ${platforms[item.platform]?.className}`}>{item.platform}</div>}<div><b>{item.title}</b><small>{item.platform} · {item.releaseYear||'—'} · {formatBytes(item.fileSize)}</small></div><button onClick={()=>remove(item.id)} aria-label={`Remover ${item.title}`}>×</button></div>)}</section></div>
  </main></div>
}

const platformFoldersForUI = { GBA:'gba', SWITCH:'switch', N3DS:'3ds' }

function UploadPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [platform,setPlatform] = useState('GBA')
  const [coverPreview,setCoverPreview] = useState('')
  const [romName,setRomName] = useState('')
  const [coverName,setCoverName] = useState('')
  const [message,setMessage] = useState('')
  const [loading,setLoading] = useState(false)

  useEffect(() => () => { if (coverPreview) URL.revokeObjectURL(coverPreview) }, [coverPreview])
  if (!user) return <Navigate to="/login"/>
  if (user.role !== 'ADMIN') return <AdminAccessDenied/>

  const chooseCover = e => {
    const file = e.target.files?.[0]
    if (coverPreview) URL.revokeObjectURL(coverPreview)
    setCoverName(file?.name || '')
    setCoverPreview(file ? URL.createObjectURL(file) : '')
  }
  const submit = async e => {
    e.preventDefault()
    setLoading(true)
    setMessage('')
    try {
      await request('/roms',{ method:'POST', body:new FormData(e.currentTarget) })
      setMessage('ROM e capa enviadas com sucesso.')
      setTimeout(() => navigate('/admin'), 800)
    } catch(err) {
      setMessage(err.message)
    } finally {
      setLoading(false)
    }
  }

  return <div className={`admin-page upload-page ${platforms[platform].className}`}><Header/><main>
    <a href="/admin" className="back">← VOLTAR AO CONTROLE DO VAULT</a>
    <div className="upload-heading"><div><span>UPLOAD ADMINISTRATIVO</span><h1>Inserir nova ROM</h1><p>Escolha a plataforma primeiro. O arquivo será guardado automaticamente na pasta correspondente dentro de <code>rooms</code>.</p></div><div className="upload-step">01 — DADOS<br/>02 — ARQUIVOS<br/>03 — PUBLICAR</div></div>
    <form className="upload-workbench" onSubmit={submit}>
      <section className="upload-form-panel">
        <div className="upload-section-title"><span>01</span><div><b>Identificação</b><small>Dados exibidos na biblioteca</small></div></div>
        <Field label="TÍTULO DA ROM" name="title"/>
        <div className="platform-picker" role="group" aria-label="Emulador">
          {Object.entries(platforms).map(([key,p])=><label key={key} className={platform===key?'selected':''}><input type="radio" name="platform" value={key} checked={platform===key} onChange={()=>setPlatform(key)}/><b>{p.short}</b><span>{p.name}</span></label>)}
        </div>
        <div className="form-row"><Field label="ANO DE LANÇAMENTO" name="releaseYear" type="number" min="1989" max="2100"/><label className="field"><span>STATUS</span><input value="PRONTO PARA PUBLICAR" readOnly/></label></div>
        <label className="field"><span>DESCRIÇÃO</span><textarea name="description" placeholder="Uma breve descrição para a página do jogo."/></label>
      </section>
      <section className="upload-files-panel">
        <div className="upload-section-title"><span>02</span><div><b>Arquivos</b><small>ROM e imagem de apresentação</small></div></div>
        <label className={`file-card rom-file ${romName?'has-file':''}`}><input type="file" name="file" required accept=".zip,.7z,.gba,.xci,.nsp,.3ds,.cia" onChange={e=>setRomName(e.target.files?.[0]?.name||'')}/><span className="file-icon">▣</span><div><b>{romName||'Selecionar arquivo da ROM'}</b><small>{platform==='GBA'?'GBA, ZIP ou 7Z':platform==='SWITCH'?'XCI, NSP, ZIP ou 7Z':'3DS, CIA, ZIP ou 7Z'}</small></div><em>{romName?'ALTERAR':'PROCURAR'}</em></label>
        <label className={`cover-drop ${coverPreview?'has-cover':''}`} style={coverPreview?{backgroundImage:`linear-gradient(#090b1288,#090b1288),url(${coverPreview})`}:{}}><input type="file" name="cover" required accept=".jpg,.jpeg,.png,.webp" onChange={chooseCover}/><span className="file-icon">◇</span><b>{coverName||'Enviar imagem de capa'}</b><small>JPG, PNG ou WEBP · orientação vertical recomendada</small><em>{coverPreview?'TROCAR CAPA':'SELECIONAR CAPA'}</em></label>
        <div className="upload-destination"><span>DESTINO</span><code>rooms/{platformFoldersForUI[platform]}/</code></div>
        {message&&<div className="form-message">{message}</div>}
        <button className="primary publish-button" disabled={loading}>{loading?'ENVIANDO ARQUIVOS...':'PUBLICAR NO VAULT'} <span>↑</span></button>
      </section>
    </form>
  </main></div>
}
function Footer(){return <footer><span>© 2026 ARCADIA VAULT</span><span>BUILD 0.1.0 · BETA</span></footer>}
function App(){return <AuthProvider><BrowserRouter><Routes><Route path="/" element={<Home/>}/><Route path="/console/:platform" element={<ConsolePage/>}/><Route path="/login" element={<AuthPage/>}/><Route path="/reset-password" element={<ResetPasswordPage/>}/><Route path="/admin" element={<AdminPage/>}/><Route path="/admin/upload" element={<UploadPage/>}/><Route path="*" element={<Navigate to="/"/>}/></Routes></BrowserRouter></AuthProvider>}

createRoot(document.getElementById('root')).render(<App/>)
