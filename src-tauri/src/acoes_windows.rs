//! As tarefas da lista de atalhos do Windows (v0.5): o clique direito no
//! ícone do Tomatito, na barra de tarefas, mostra "Iniciar ou pausar foco",
//! "Pular fase" e "Encerrar sessão". Cada tarefa é um atalho para o próprio
//! executável com `--acao=<nome>` (`acoes.rs`); o `single-instance` entrega o
//! pedido à instância que roda.
//!
//! A lista é gravada a cada início (o Windows a guarda por aplicativo). Uma
//! falha aqui só vai para o registro: o app segue sem a lista.

use windows::Win32::Storage::EnhancedStorage::PKEY_Title;
use windows::Win32::System::Com::StructuredStorage::PROPVARIANT;
use windows::Win32::System::Com::{CLSCTX_INPROC_SERVER, CoCreateInstance};
use windows::Win32::UI::Shell::Common::{IObjectArray, IObjectCollection};
use windows::Win32::UI::Shell::PropertiesSystem::IPropertyStore;
use windows::Win32::UI::Shell::{
    DestinationList, EnumerableObjectCollection, ICustomDestinationList, IShellLinkW, ShellLink,
};
use windows::core::{HSTRING, Interface};

use crate::acoes::Acao;

/// Grava as tarefas na lista de atalhos deste executável.
pub fn registrar() -> windows::core::Result<()> {
    let exe = std::env::current_exe()
        .map(|p| HSTRING::from(p.as_os_str()))
        .map_err(|e| windows::core::Error::new(windows::core::HRESULT(-1), e.to_string()))?;
    // SAFETY: chamadas COM na thread principal, que o tao já inicializou em
    // apartamento (STA); todos os ponteiros vêm das próprias chamadas.
    unsafe {
        let lista: ICustomDestinationList =
            CoCreateInstance(&DestinationList, None, CLSCTX_INPROC_SERVER)?;
        let mut vagas = 0u32;
        let _removidos: IObjectArray = lista.BeginList(&mut vagas)?;
        let tarefas: IObjectCollection =
            CoCreateInstance(&EnumerableObjectCollection, None, CLSCTX_INPROC_SERVER)?;
        for acao in Acao::TODAS {
            let atalho: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER)?;
            atalho.SetPath(&exe)?;
            atalho.SetArguments(&HSTRING::from(acao.argumento()))?;
            atalho.SetIconLocation(&exe, 0)?;
            let propriedades: IPropertyStore = atalho.cast()?;
            propriedades.SetValue(&PKEY_Title, &PROPVARIANT::from(acao.rotulo()))?;
            propriedades.Commit()?;
            tarefas.AddObject(&atalho)?;
        }
        let itens: IObjectArray = tarefas.cast()?;
        lista.AddUserTasks(&itens)?;
        lista.CommitList()?;
    }
    Ok(())
}
