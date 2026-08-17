/**
 * Idioma da interface.
 *
 * Cobertura: a moldura do app (navegação, cabeçalhos, ações comuns) e as
 * telas de conta — login, cadastro, perfil e configurações. O conteúdo que
 * VOCÊ escreve (nomes de pastas, títulos de notas, tarefas) nunca é
 * traduzido, porque é seu texto e não da interface.
 */

import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'

export const IDIOMAS = [
  { value: 'pt-BR', label: 'Português (Brasil)' },
  { value: 'en', label: 'English' },
]

export const IDIOMA_KEY = 'notefy.idioma'

const pt = {
  nav: {
    inicio: 'Início',
    recentes: 'Recentes',
    arquivos: 'Arquivos',
    buscar: 'Buscar',
    quadro: 'Quadro',
    calendario: 'Calendário',
    roadmap: 'Roadmap',
    lixeira: 'Lixeira',
    categorias: 'Categorias',
    novaCategoria: 'Nova categoria',
    configuracoes: 'Configurações',
    perfil: 'Editar perfil',
    sair: 'Sair',
    abrirMenu: 'Abrir menu',
    recolherMenu: 'Recolher menu',
    expandirMenu: 'Expandir menu',
    dica: 'Arraste itens e pastas para mover. Clique com o botão direito para mais opções.',
  },
  acoes: {
    salvar: 'Salvar',
    cancelar: 'Cancelar',
    excluir: 'Excluir',
    editar: 'Editar',
    criar: 'Criar',
    abrir: 'Abrir',
    renomear: 'Renomear',
    importarArquivo: 'Importar arquivo',
    novaPasta: 'Nova pasta',
    subpasta: 'Subpasta',
    salvo: 'salvo',
  },
  login: {
    subtitulo: 'Suas notas, estudos e tarefas em um só lugar.',
    usuario: 'Nome de usuário',
    senha: 'Senha',
    entrar: 'Entrar',
    semConta: 'Ainda não tem conta?',
    criarConta: 'Criar conta',
    erro: 'Nome de usuário ou senha incorretos.',
  },
  cadastro: {
    titulo: 'Criar conta',
    subtitulo: 'Comece a organizar seus estudos hoje.',
    confirmarSenha: 'Confirmar senha',
    dicaSenha: 'Mínimo de 8 caracteres.',
    jaTemConta: 'Já tem conta?',
    senhasDiferentes: 'As senhas não conferem.',
  },
  perfil: {
    titulo: 'Editar perfil',
    subtitulo: 'Sua foto, seu nome de usuário e sua senha.',
    foto: 'Foto de perfil',
    trocarFoto: 'Trocar foto',
    removerFoto: 'Remover foto',
    dicaFoto: 'PNG ou JPG, até 5 MB.',
    conta: 'Conta',
    nomeExibicao: 'Nome de exibição',
    dicaNomeExibicao: 'Opcional. Aparece no lugar do nome de usuário.',
    dicaUsuario: 'É com ele que você entra no app.',
    seguranca: 'Segurança',
    senhaAtual: 'Senha atual',
    novaSenha: 'Nova senha',
    alterarSenha: 'Alterar senha',
    senhaAlterada: 'senha alterada',
    voltar: 'Voltar',
  },
  config: {
    titulo: 'Configurações',
    subtitulo: 'Idioma, aparência e seus dados.',
    idioma: 'Idioma',
    idiomaDesc: 'Idioma da interface do Notefy.',
    aparencia: 'Aparência e interface',
    aparenciaDesc: 'Tema, densidade e cor de destaque.',
    tema: 'Tema',
    temaSistema: 'Seguir o sistema',
    temaClaro: 'Claro',
    temaEscuro: 'Escuro',
    modoZen: 'Modo zen',
    modoZenDesc: 'Esconde a barra lateral e os cabeçalhos. Ctrl+. liga e desliga.',
    corDestaque: 'Cor de destaque',
    corDestaqueDesc: 'Usada em botões, links e seleções.',
    corPersonalizada: 'Cor personalizada',
    restaurarCor: 'Restaurar padrão',
    telaInicial: 'Tela inicial',
    dados: 'Dados',
    dadosDesc:
      'Seu conteúdo fica neste computador. O backup leva tudo — categorias, pastas, itens, arquivos e tarefas — num arquivo .zip.',
    exportar: 'Exportar backup',
    exportando: 'Preparando backup...',
    importar: 'Importar backup',
    importando: 'Importando...',
    substituir: 'Substituir o conteúdo atual',
    substituirDesc:
      'Sem marcar, o backup é ADICIONADO ao que você já tem — nada é apagado.',
    importado: 'Backup importado: {{categorias}} categoria(s), {{pastas}} pasta(s), {{documentos}} item(ns) e {{tarefas}} tarefa(s).',
    confirmarSubstituir: 'Substituir tudo?',
    confirmarSubstituirMsg:
      'Todo o seu conteúdo atual será apagado e trocado pelo do backup. Isso não pode ser desfeito.',
    excluirConta: 'Excluir conta',
    excluirContaDesc:
      'Apaga a conta e tudo que está nela: categorias, pastas, notas, arquivos, planilhas, diagramas, canvas e tarefas. Não há como desfazer.',
    excluirContaBotao: 'Excluir minha conta',
    dicaSenhaExcluir: 'Confirme sua senha para liberar a exclusão.',
  },
}

const en = {
  nav: {
    inicio: 'Home',
    recentes: 'Recent',
    arquivos: 'Files',
    buscar: 'Search',
    quadro: 'Board',
    calendario: 'Calendar',
    roadmap: 'Roadmap',
    lixeira: 'Trash',
    categorias: 'Categories',
    novaCategoria: 'New category',
    configuracoes: 'Settings',
    perfil: 'Edit profile',
    sair: 'Sign out',
    abrirMenu: 'Open menu',
    recolherMenu: 'Collapse menu',
    expandirMenu: 'Expand menu',
    dica: 'Drag items and folders to move them. Right-click for more options.',
  },
  acoes: {
    salvar: 'Save',
    cancelar: 'Cancel',
    excluir: 'Delete',
    editar: 'Edit',
    criar: 'Create',
    abrir: 'Open',
    renomear: 'Rename',
    importarArquivo: 'Import file',
    novaPasta: 'New folder',
    subpasta: 'Subfolder',
    salvo: 'saved',
  },
  login: {
    subtitulo: 'Your notes, studies and tasks in one place.',
    usuario: 'Username',
    senha: 'Password',
    entrar: 'Sign in',
    semConta: "Don't have an account?",
    criarConta: 'Create account',
    erro: 'Incorrect username or password.',
  },
  cadastro: {
    titulo: 'Create account',
    subtitulo: 'Start organizing your studies today.',
    confirmarSenha: 'Confirm password',
    dicaSenha: 'At least 8 characters.',
    jaTemConta: 'Already have an account?',
    senhasDiferentes: "Passwords don't match.",
  },
  perfil: {
    titulo: 'Edit profile',
    subtitulo: 'Your photo, your username and your password.',
    foto: 'Profile photo',
    trocarFoto: 'Change photo',
    removerFoto: 'Remove photo',
    dicaFoto: 'PNG or JPG, up to 5 MB.',
    conta: 'Account',
    nomeExibicao: 'Display name',
    dicaNomeExibicao: 'Optional. Shown instead of your username.',
    dicaUsuario: 'This is what you sign in with.',
    seguranca: 'Security',
    senhaAtual: 'Current password',
    novaSenha: 'New password',
    alterarSenha: 'Change password',
    senhaAlterada: 'password changed',
    voltar: 'Back',
  },
  config: {
    titulo: 'Settings',
    subtitulo: 'Language, appearance and your data.',
    idioma: 'Language',
    idiomaDesc: "The Notefy interface language.",
    aparencia: 'Appearance and interface',
    aparenciaDesc: 'Theme, density and accent color.',
    tema: 'Theme',
    temaSistema: 'Follow the system',
    temaClaro: 'Light',
    temaEscuro: 'Dark',
    modoZen: 'Zen mode',
    modoZenDesc: 'Hides the sidebar and headers. Ctrl+. toggles it.',
    corDestaque: 'Accent color',
    corDestaqueDesc: 'Used in buttons, links and selections.',
    corPersonalizada: 'Custom color',
    restaurarCor: 'Reset to default',
    telaInicial: 'Start screen',
    dados: 'Data',
    dadosDesc:
      'Your content lives on this computer. A backup takes everything — categories, folders, items, files and tasks — into a single .zip.',
    exportar: 'Export backup',
    exportando: 'Preparing backup...',
    importar: 'Import backup',
    importando: 'Importing...',
    substituir: 'Replace current content',
    substituirDesc:
      'If unchecked, the backup is ADDED to what you already have — nothing is deleted.',
    importado: 'Backup imported: {{categorias}} category(ies), {{pastas}} folder(s), {{documentos}} item(s) and {{tarefas}} task(s).',
    confirmarSubstituir: 'Replace everything?',
    confirmarSubstituirMsg:
      'All of your current content will be deleted and replaced with the backup. This cannot be undone.',
    excluirConta: 'Delete account',
    excluirContaDesc:
      'Deletes the account and everything in it: categories, folders, notes, files, spreadsheets, diagrams, canvases and tasks. This cannot be undone.',
    excluirContaBotao: 'Delete my account',
    dicaSenhaExcluir: 'Confirm your password to enable deletion.',
  },
}

export function idiomaSalvo() {
  const guardado = localStorage.getItem(IDIOMA_KEY)
  if (guardado && IDIOMAS.some((i) => i.value === guardado)) return guardado
  // Sem escolha registrada, segue o idioma do sistema — e cai no português
  // porque é a língua em que o app foi escrito.
  return String(navigator.language || '').toLowerCase().startsWith('en') ? 'en' : 'pt-BR'
}

i18next.use(initReactI18next).init({
  resources: {
    'pt-BR': { translation: pt },
    en: { translation: en },
  },
  lng: idiomaSalvo(),
  fallbackLng: 'pt-BR',
  interpolation: { escapeValue: false },
})

export default i18next
