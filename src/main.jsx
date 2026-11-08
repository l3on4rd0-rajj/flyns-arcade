import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router'
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
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('arcadia_user') || 'null')
    } catch {
      localStorage.removeItem('arcadia_user')
      localStorage.removeItem('arcadia_token')
      return null
    }
  })
  const save = data => { localStorage.setItem('arcadia_token', data.token); localStorage.setItem('arcadia_user', JSON.stringify(data.user)); setUser(data.user) }
  const logout = () => { localStorage.removeItem('arcadia_token'); localStorage.removeItem('arcadia_user'); setUser(null) }
  return <AuthContext.Provider value={{ user, save, logout }}>{children}</AuthContext.Provider>
}
const useAuth = () => useContext(AuthContext)

function AmbientScene() {
  useEffect(() => {
    const canvas = document.querySelector('#ambient-canvas')
    if (!canvas) return
    let renderer
    let geometry
    let material
    let frame
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha:true, antialias:true })
      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(45, 1, .1, 100)
      camera.position.z = 6
      geometry = new THREE.IcosahedronGeometry(1.45, 1)
      material = new THREE.MeshBasicMaterial({ color:0x8c73ff, wireframe:true, transparent:true, opacity:.13 })
      const mesh = new THREE.Mesh(geometry, material)
      scene.add(mesh)
      const resize = () => {
        renderer.setSize(canvas.clientWidth, canvas.clientHeight, false)
        camera.aspect = canvas.clientWidth / canvas.clientHeight
        camera.updateProjectionMatrix()
      }
      const tick = () => {
        try {
          resize()
          mesh.rotation.x += .0018
          mesh.rotation.y += .0026
          renderer.render(scene, camera)
          frame = requestAnimationFrame(tick)
        } catch (error) {
          console.warn('Animação WebGL desativada:', error)
        }
      }
      tick()
    } catch (error) {
      console.warn('WebGL indisponível; usando fundo estático:', error)
    }
    return () => {
      if (frame) cancelAnimationFrame(frame)
      geometry?.dispose()
      material?.dispose()
      renderer?.dispose()
    }
  }, [])
  return <canvas id="ambient-canvas" aria-hidden="true" />
}

function Header() {
  const { user, logout } = useAuth()
  const { pathname } = useLocation()
  const initials = user?.fullName?.split(' ').filter(Boolean).slice(0,2).map(part=>part[0]).join('').toUpperCase()
  return <header className="site-header">
    <div className="header-shell">
      <a className="brand" href="/" aria-label="Arcadia Vault — início"><span className="brand-mark"><i/>A</span><span>ARCADIA<small>VAULT · DIGITAL ARCHIVE</small></span></a>
      <div className="header-status"><i/><span>VAULT ONLINE</span></div>
      <nav className="desktop-nav" aria-label="Navegação principal">
        <a href="/#systems" className={pathname.startsWith('/console')?'active':''}><span>01</span>Sistemas</a>
        <a href="/#about"><span>02</span>Manifesto</a>
        {user?.role === 'ADMIN' && <a href="/admin" className={pathname.startsWith('/admin')?'active admin-link':'admin-link'}><span>03</span>Admin</a>}
      </nav>
      <div className="header-actions">
        {user ? <><a href="/profile" className={`profile-chip ${pathname==='/profile'?'active':''}`}><span className="profile-avatar">{initials||'P1'}</span><span><b>{user.fullName?.split(' ')[0]}</b><small>{user.role==='ADMIN'?'ADMINISTRADOR':'JOGADOR'}</small></span></a><button className="header-exit" onClick={logout} aria-label="Sair da conta">↗</button></> : <a className="header-login" href="/login"><span>IDENTIFICAR JOGADOR</span><b>→</b></a>}
      </div>
    </div>
    <div className="header-scanline"/>
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
    <section className="service-strip" aria-label="Diferenciais"><div><span>01</span><b>CURADORIA POR SISTEMA</b><small>Cada biblioteca respeita a identidade do console.</small></div><div><span>02</span><b>ACESSO PROTEGIDO</b><small>Conta, MFA e downloads autenticados.</small></div><div><span>03</span><b>ARQUIVO PESSOAL</b><small>Organização simples para sua coleção legal.</small></div></section>
    <LibrarySearch/>
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
  </main><Footer/></div>
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
  const controlledValue = props.onChange || value !== undefined ? { value: value ?? '' } : {}
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

function ProfilePage() {
  const { user } = useAuth()
  const [form,setForm] = useState({})
  const [downloads,setDownloads] = useState([])
  const [password,setPassword] = useState({currentPassword:'',newPassword:''})
  const [message,setMessage] = useState('')
  useEffect(()=>{ if(user) Promise.all([request('/profile'),request('/profile/downloads')]).then(([profile,history])=>{setForm(profile);setDownloads(history)}).catch(e=>setMessage(e.message)) },[user])
  if (!user) return <Navigate to="/login"/>
  const change=e=>setForm({...form,[e.target.name]:e.target.value})
  const findCep=async e=>{if(e.key!=='Enter')return;e.preventDefault();try{const value=String(form.cep||'').replace(/\D/g,'');const data=await fetch(`https://viacep.com.br/ws/${value}/json/`).then(r=>r.json());if(data.erro)throw new Error();setForm({...form,cep:value,street:data.logradouro,district:data.bairro,city:data.localidade,state:data.uf});setMessage('Endereço localizado.')}catch{setMessage('CEP não encontrado.')}}
  const saveProfile=async e=>{e.preventDefault();setMessage('');try{setForm(await request('/profile',{method:'PATCH',body:JSON.stringify(form)}));setMessage('Perfil atualizado com sucesso.')}catch(error){setMessage(error.message)}}
  const savePassword=async e=>{e.preventDefault();setMessage('');try{const result=await request('/profile/password',{method:'PATCH',body:JSON.stringify(password)});setPassword({currentPassword:'',newPassword:''});setMessage(result.message)}catch(error){setMessage(error.message)}}
  return <div className="profile-page"><Header/><main><div className="profile-heading"><span>IDENTIDADE DO JOGADOR</span><h1>Meu perfil</h1><p>Gerencie seus dados, endereço, credenciais e histórico dentro do Vault.</p></div>{message&&<div className="form-message profile-message">{message}</div>}<div className="profile-grid">
    <form className="profile-panel" onSubmit={saveProfile}><div className="panel-title"><h2>Dados e endereço</h2><span>{form.status}</span></div><Field label="NOME COMPLETO" name="fullName" value={form.fullName} onChange={change}/><div className="form-row"><Field label="E-MAIL" value={form.email} readOnly/><Field label="CPF" value={form.cpf} readOnly/></div><div className="form-row"><Field label="CEP · ENTER PARA BUSCAR" name="cep" value={form.cep} onChange={change} onKeyDown={findCep}/><Field label="RUA" name="street" value={form.street} onChange={change}/><Field label="NÚMERO" name="number" value={form.number} onChange={change}/></div><div className="form-row"><Field label="BAIRRO" name="district" value={form.district} onChange={change}/><Field label="CIDADE" name="city" value={form.city} onChange={change}/><Field label="UF" name="state" value={form.state} onChange={change}/></div><Field label="COMPLEMENTO (OPCIONAL)" name="complement" value={form.complement} onChange={change}/><button className="primary">SALVAR ALTERAÇÕES →</button></form>
    <div className="profile-side"><form className="profile-panel" onSubmit={savePassword}><div className="panel-title"><h2>Segurança</h2><span>MFA ATIVO</span></div><Field label="SENHA ATUAL" type="password" value={password.currentPassword} onChange={e=>setPassword({...password,currentPassword:e.target.value})}/><Field label="NOVA SENHA" type="password" value={password.newPassword} onChange={e=>setPassword({...password,newPassword:e.target.value})}/><small className="password-hint">8+ caracteres, com maiúscula, minúscula e número.</small><button className="primary">ATUALIZAR SENHA →</button></form><section className="profile-panel history"><div className="panel-title"><h2>Downloads recentes</h2><span>{downloads.length}</span></div>{downloads.length?downloads.slice(0,8).map(item=><div className="history-item" key={item.id}><div><b>{item.rom.title}</b><small>{item.rom.platform}</small></div><time>{new Date(item.createdAt).toLocaleDateString('pt-BR')}</time></div>):<div className="empty-state">Nenhum download registrado.</div>}</section></div>
  </div></main><Footer/></div>
}

function AdminPage() {
  const { user } = useAuth()
  const [items,setItems] = useState([])
  const [users,setUsers] = useState([])
  const [metrics,setMetrics] = useState(null)
  const [message,setMessage] = useState('')
  const refresh = () => Promise.all([request('/roms'),request('/usuarios'),request('/usuarios/metrics')]).then(([roms,people,stats])=>{setItems(roms);setUsers(people);setMetrics(stats)}).catch(e=>setMessage(e.message))
  useEffect(refresh,[])
  if (!user) return <Navigate to="/login"/>
  if (user.role !== 'ADMIN') return <AdminAccessDenied/>
  const remove = async id => { if (!confirm('Remover esta ROM do catálogo?')) return; await request(`/roms/${id}`,{method:'DELETE'}); refresh() }
  const updateUser = async (id,field,value) => { try { await request(`/usuarios/${id}/${field}`,{method:'PATCH',body:JSON.stringify({[field]:value})}); refresh() } catch(error){ setMessage(error.message) } }
  return <div className="admin-page"><Header/><main><div className="admin-head"><span>ACESSO NÍVEL 9</span><h1>Controle do Vault</h1><p>Gerencie o catálogo e envie arquivos para as bibliotecas de cada emulador.</p><a className="primary" href="/admin/upload">NOVA ROM <span>＋</span></a></div>
    {message&&<div className="form-message">{message}</div>}{metrics&&<div className="metric-grid"><div><span>USUÁRIOS</span><b>{metrics.totalUsers}</b><small>{metrics.activeUsers} ativos</small></div><div><span>DOWNLOADS</span><b>{metrics.totalDownloads}</b><small>volume acumulado</small></div><div><span>ACESSOS</span><b>{metrics.totalAccesses}</b><small>logins concluídos</small></div><div><span>RESTRITOS</span><b>{metrics.inactiveUsers+metrics.revokedUsers}</b><small>{metrics.revokedUsers} revogados</small></div></div>}
    <section className="admin-panel users-panel"><div className="panel-title"><h2>Usuários cadastrados</h2><span>{users.length} CONTAS</span></div><div className="users-table"><div className="user-row user-header"><span>USUÁRIO</span><span>VOLUME</span><span>PERFIL</span><span>ACESSO</span></div>{users.map(person=><div className="user-row" key={person.id}><div><b>{person.fullName}</b><small>{person.email}</small></div><div><b>{person._count.downloads} downloads</b><small>{person._count.accessEvents} eventos</small></div><select value={person.role} disabled={person.id===user.id} onChange={e=>updateUser(person.id,'role',e.target.value)}><option value="USER">Usuário</option><option value="ADMIN">Admin</option></select><select value={person.status} disabled={person.id===user.id} onChange={e=>updateUser(person.id,'status',e.target.value)}><option value="ACTIVE">Ativa</option><option value="INACTIVE">Inativa</option><option value="REVOKED">Revogada</option></select></div>)}</div></section>
    <div className="admin-catalog"><section className="admin-panel library"><div className="panel-title"><h2>Catálogo</h2><span>{items.length} ITENS</span></div>{items.map(item=><div className="admin-item" key={item.id}>{item.coverUrl?<img className="admin-cover" src={item.coverUrl} alt=""/>:<div className={`mini-cover ${platforms[item.platform]?.className}`}>{item.platform}</div>}<div><b>{item.title}</b><small>{item.platform} · {item.genre} · {item.releaseYear||'—'} · {formatBytes(item.fileSize)}</small></div><div className="admin-item-actions"><a href={`/admin/roms/${item.id}/edit`} aria-label={`Editar ${item.title}`}>EDITAR</a><button onClick={()=>remove(item.id)} aria-label={`Remover ${item.title}`}>×</button></div></div>)}</section></div>
  </main></div>
}

const platformFoldersForUI = { GBA:'gba', SWITCH:'switch', N3DS:'3ds' }

function EditRomPage() {
  const { user } = useAuth()
  const { id } = useParams()
  const navigate = useNavigate()
  const [form,setForm] = useState(null)
  const [coverPreview,setCoverPreview] = useState('')
  const [romName,setRomName] = useState('')
  const [coverName,setCoverName] = useState('')
  const [message,setMessage] = useState('')
  const [loading,setLoading] = useState(false)
  useEffect(()=>{ if(user?.role==='ADMIN') request(`/roms/${id}`).then(data=>{setForm(data);setCoverPreview(data.coverUrl||'')}).catch(e=>setMessage(e.message)) },[id,user])
  if (!user) return <Navigate to="/login"/>
  if (user.role !== 'ADMIN') return <AdminAccessDenied/>
  if (!form) return <div className="admin-page"><Header/><main><div className="form-message">{message||'Carregando cadastro da ROM...'}</div></main></div>
  const change=e=>setForm({...form,[e.target.name]:e.target.value})
  const chooseCover=e=>{const file=e.target.files?.[0];setCoverName(file?.name||'');if(file)setCoverPreview(URL.createObjectURL(file))}
  const submit=async e=>{
    e.preventDefault();setLoading(true);setMessage('')
    try{await request(`/roms/${id}`,{method:'PATCH',body:new FormData(e.currentTarget)});setMessage('Cadastro e arquivos atualizados com sucesso.');setTimeout(()=>navigate('/admin'),700)}
    catch(error){setMessage(error.message)}finally{setLoading(false)}
  }
  return <div className={`admin-page upload-page ${platforms[form.platform]?.className||'gba'}`}><Header/><main>
    <a href="/admin" className="back">← VOLTAR AO CATÁLOGO</a>
    <div className="upload-heading"><div><span>EDIÇÃO ADMINISTRATIVA</span><h1>Editar ROM</h1><p>Atualize o cadastro ou selecione novos arquivos apenas para o conteúdo que deseja substituir.</p></div><div className="upload-step">01 — CADASTRO<br/>02 — SUBSTITUIÇÃO<br/>03 — SALVAR</div></div>
    <form className="upload-workbench" onSubmit={submit}>
      <section className="upload-form-panel"><div className="upload-section-title"><span>01</span><div><b>Dados cadastrados</b><small>Informações exibidas na biblioteca</small></div></div>
        <Field label="TÍTULO DA ROM" name="title" value={form.title} onChange={change}/>
        <div className="platform-picker">{Object.entries(platforms).map(([key,p])=><label key={key} className={form.platform===key?'selected':''}><input type="radio" name="platform" value={key} checked={form.platform===key} onChange={change}/><b>{p.short}</b><span>{p.name}</span></label>)}</div>
        <div className="form-row"><Field label="ANO DE LANÇAMENTO" name="releaseYear" type="number" min="1989" max="2100" value={form.releaseYear} onChange={change}/><Field label="GÊNERO" name="genre" value={form.genre} onChange={change}/></div>
        <label className="field"><span>DESCRIÇÃO</span><textarea name="description" value={form.description||''} onChange={change}/></label>
      </section>
      <section className="upload-files-panel"><div className="upload-section-title"><span>02</span><div><b>Substituir arquivos</b><small>Deixe vazio para manter o arquivo atual</small></div></div>
        <label className={`file-card rom-file ${romName?'has-file':''}`}><input type="file" name="file" accept=".zip,.7z,.gba,.xci,.nsp,.3ds,.cia" onChange={e=>setRomName(e.target.files?.[0]?.name||'')}/><span className="file-icon">▣</span><div><b>{romName||form.fileName}</b><small>{romName?'NOVO ARQUIVO SELECIONADO':'ARQUIVO ATUAL · CLIQUE PARA SUBSTITUIR'}</small></div><em>{romName?'ALTERAR':'SUBSTITUIR'}</em></label>
        <label className="cover-drop has-cover" style={coverPreview?{backgroundImage:`linear-gradient(#090b1288,#090b1288),url(${coverPreview})`}:{}}><input type="file" name="cover" accept=".jpg,.jpeg,.png,.webp" onChange={chooseCover}/><span className="file-icon">◇</span><b>{coverName||'Capa atual'}</b><small>Selecione uma imagem somente se desejar substituir</small><em>SUBSTITUIR CAPA</em></label>
        <div className="upload-destination"><span>DESTINO DE NOVOS ARQUIVOS</span><code>rooms/{platformFoldersForUI[form.platform]}/</code></div>
        {message&&<div className="form-message">{message}</div>}<button className="primary publish-button" disabled={loading}>{loading?'SALVANDO...':'SALVAR ALTERAÇÕES'} <span>→</span></button>
      </section>
    </form>
  </main></div>
}

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
        <div className="form-row"><Field label="ANO DE LANÇAMENTO" name="releaseYear" type="number" min="1989" max="2100"/><Field label="GÊNERO" name="genre" placeholder="Aventura, RPG, corrida..."/><label className="field"><span>STATUS</span><input value="PRONTO PARA PUBLICAR" readOnly/></label></div>
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
function Footer(){
  return <footer className="site-footer">
    <div className="footer-glow"/>
    <div className="footer-main">
      <div className="footer-intro"><a className="brand footer-brand" href="/"><span className="brand-mark"><i/>A</span><span>ARCADIA<small>VAULT · DIGITAL ARCHIVE</small></span></a><p>Uma interface feita para preservar memórias, organizar coleções e reencontrar grandes jogos.</p><div className="footer-signal"><i/> TODOS OS SISTEMAS OPERACIONAIS</div></div>
      <div className="footer-column"><span>EXPLORAR</span><a href="/#systems">Sistemas</a><a href="/console/GBA">Game Boy Advance</a><a href="/console/SWITCH">Nintendo Switch</a><a href="/console/N3DS">Nintendo 3DS</a></div>
      <div className="footer-column"><span>ACESSO</span><a href="/login">Entrar ou cadastrar</a><a href="/login">Recuperar senha</a><a href="/admin">Área administrativa</a></div>
      <div className="footer-note"><span>USO RESPONSÁVEL</span><p>Mantenha somente cópias de jogos que você possui e tem direito legal de armazenar.</p><a href="/#about">LER O MANIFESTO <b>↗</b></a></div>
    </div>
    <div className="footer-bottom"><span>© 2026 ARCADIA VAULT</span><span className="footer-build"><i/> BUILD 0.1.0 · BETA</span><span>FEITO PARA JOGADORES</span></div>
  </footer>
}

function LibrarySearch() {
  const [query,setQuery] = useState('')
  const [genre,setGenre] = useState('')
  const [genres,setGenres] = useState([])
  const [results,setResults] = useState([])
  const [searched,setSearched] = useState(false)
  const [loading,setLoading] = useState(false)
  useEffect(()=>{ request('/roms/genres').then(setGenres).catch(()=>{}) },[])
  const search = async e => {
    e?.preventDefault(); setLoading(true)
    try {
      const params = new URLSearchParams()
      if (query.trim()) params.set('q',query.trim())
      if (genre) params.set('genre',genre)
      setResults(await request(`/roms?${params}`)); setSearched(true)
    } finally { setLoading(false) }
  }
  return <section className="library-search" id="search">
    <div className="search-copy"><span>BUSCA GLOBAL</span><h2>Encontre sua próxima aventura</h2><p>Pesquise pelo nome da ROM ou filtre a biblioteca por gênero.</p></div>
    <form className="search-bar" onSubmit={search}><label><span>NOME DA ROM</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Ex.: Mario, Pokémon, Zelda..."/></label><label><span>GÊNERO</span><select value={genre} onChange={e=>setGenre(e.target.value)}><option value="">Todos os gêneros</option>{genres.map(item=><option key={item}>{item}</option>)}</select></label><button className="primary" disabled={loading}>{loading?'BUSCANDO...':'BUSCAR NO VAULT →'}</button></form>
    {searched&&<div className="search-results">{results.length?results.map(game=><a href={`/console/${game.platform}`} key={game.id} className="search-result">{game.coverUrl?<img src={game.coverUrl} alt=""/>:<div className="result-placeholder">{game.platform}</div>}<div><small>{game.platform} · {game.genre}</small><b>{game.title}</b><span>{game.releaseYear||'Ano não informado'} · {formatBytes(game.fileSize)}</span></div><em>ABRIR ↗</em></a>):<div className="empty-state">Nenhuma ROM corresponde aos filtros informados.</div>}</div>}
  </section>
}
function App(){return <AuthProvider><BrowserRouter><Routes><Route path="/" element={<Home/>}/><Route path="/console/:platform" element={<ConsolePage/>}/><Route path="/login" element={<AuthPage/>}/><Route path="/reset-password" element={<ResetPasswordPage/>}/><Route path="/profile" element={<ProfilePage/>}/><Route path="/admin" element={<AdminPage/>}/><Route path="/admin/upload" element={<UploadPage/>}/><Route path="/admin/roms/:id/edit" element={<EditRomPage/>}/><Route path="*" element={<Navigate to="/"/>}/></Routes></BrowserRouter></AuthProvider>}

createRoot(document.getElementById('root')).render(<App/>)
