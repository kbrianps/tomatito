package io.github.kbrianps.tomatito.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.TimeZone

// Testes de JVM das funções puras do plugin (PLANO-ANDROID 4.2, A07b), sem
// emulador: ./gradlew :tauri-plugin-tomatito-android:testDebugUnitTest.
class PurasTest {
    private val sp = TimeZone.getTimeZone("America/Sao_Paulo")

    // 30/09/2026 17:35:00 em São Paulo (UTC−3) = 20:35:00 UTC.
    private val as1735 = 1_790_800_500_000L

    @Test
    fun estadoDasNotificacoesPorSdkEPermissao() {
        // Antes do 13 não há permissão: só o interruptor do app.
        assertEquals("granted", Notificacoes.estado(32, false, true, false, false))
        assertEquals("denied", Notificacoes.estado(26, false, false, false, false))
        // Do 13 em diante.
        assertEquals("granted", Notificacoes.estado(37, true, true, true, false))
        assertEquals("denied", Notificacoes.estado(37, true, false, true, false))
        assertEquals("prompt", Notificacoes.estado(33, false, false, false, false))
        assertEquals("prompt", Notificacoes.estado(37, false, false, true, true))
        assertEquals("denied", Notificacoes.estado(37, false, false, true, false))
    }

    @Test
    fun pedidoDoSistemaSoComPromptNo13EmDiante() {
        assertTrue(mostraPedidoDeNotificacoes(33, "prompt"))
        assertTrue(mostraPedidoDeNotificacoes(37, "prompt"))
        assertFalse(mostraPedidoDeNotificacoes(32, "prompt"))
        assertFalse(mostraPedidoDeNotificacoes(37, "granted"))
        assertFalse(mostraPedidoDeNotificacoes(37, "denied"))
    }

    @Test
    fun apiDoAlarmePorSdkEPermissao() {
        var perguntou = false
        val nunca = { perguntou = true; false }
        // Antes do 12, setAlarmClock sem perguntar nada.
        assertEquals(ApiDoAlarme.RELOGIO, apiDoAlarme(30, nunca))
        assertFalse(perguntou)
        assertEquals(ApiDoAlarme.RELOGIO, apiDoAlarme(24) { false })
        // Do 12 em diante, depende do canScheduleExactAlarms().
        assertEquals(ApiDoAlarme.RELOGIO, apiDoAlarme(31) { true })
        assertEquals(ApiDoAlarme.OCIOSO, apiDoAlarme(31) { false })
        assertEquals(ApiDoAlarme.OCIOSO, apiDoAlarme(37) { false })
        assertEquals(ApiDoAlarme.RELOGIO, apiDoAlarme(37) { true })
        assertTrue(alarmeExato(29) { false })
        assertFalse(alarmeExato(32) { false })
    }

    @Test
    fun telaDasConfiguracoesDeAvisos() {
        assertEquals(TelaDeAvisos.AVISOS_DO_APP, telaDeAvisos(37, "denied", true))
        assertEquals(TelaDeAvisos.AVISOS_DO_APP, telaDeAvisos(37, "granted", false))
        assertEquals(TelaDeAvisos.ALARME_EXATO, telaDeAvisos(31, "granted", false))
        assertEquals(TelaDeAvisos.ALARME_EXATO, telaDeAvisos(32, "granted", false))
        // No 12 sem avisos, os avisos primeiro.
        assertEquals(TelaDeAvisos.AVISOS_DO_APP, telaDeAvisos(31, "denied", false))
        assertEquals(TelaDeAvisos.AVISOS_DO_APP, telaDeAvisos(31, "granted", true))
        assertEquals(TelaDeAvisos.AVISOS_DO_APP, telaDeAvisos(26, "denied", true))
        assertEquals(TelaDeAvisos.DETALHES_DO_APP, telaDeAvisos(25, "denied", true))
    }

    @Test
    fun somEUrl() {
        assertEquals("focus_end", recursoDoSom("focusEnd"))
        assertEquals("break_end", recursoDoSom("breakEnd"))
        assertNull(recursoDoSom("focus-end"))
        assertNull(recursoDoSom(null))
        assertTrue(urlExterna("https://example.org"))
        assertTrue(urlExterna("http://example.org/privacidade?x=1#y"))
        assertTrue(urlExterna("HTTPS://tomatito.pages.dev/privacidade"))
        for (ruim in listOf(null, "", " ", "javascript:alert(1)", "file:///sdcard/x", "intent://x#Intent;end",
            "/privacidade", "https://", "https://exa mple.org", "tauri://localhost", "mailto:a@b.c")) {
            assertFalse(ruim.toString(), urlExterna(ruim))
        }
    }

    @Test
    fun tituloETextoDaContinua() {
        assertEquals("Foco", tituloDaContinua(Continua("foco")))
        assertEquals("Intervalo", tituloDaContinua(Continua("intervalo")))
        assertEquals("Temporizador: Chá", tituloDaContinua(Continua("temporizador", "Chá")))
        assertEquals("Temporizador", tituloDaContinua(Continua("temporizador", " ")))
        assertEquals("Termina às 17:35", textoDaContinua(Continua("foco", fimMs = as1735), sp))
        assertEquals("Termina às 20:35", textoDaContinua(Continua("foco", fimMs = as1735), TimeZone.getTimeZone("UTC")))
        // Pausado: minutos para cima, como o tray_time; nunca menos de 1.
        val pausado = { ms: Long -> textoDaContinua(Continua("foco", pausado = true, restanteMs = ms), sp) }
        assertEquals("Pausado · faltam 12 min", pausado(12 * 60_000L))
        assertEquals("Pausado · faltam 12 min", pausado(11 * 60_000L + 1))
        assertEquals("Pausado · faltam 1 min", pausado(1))
        assertEquals("Pausado · faltam 1 min", pausado(0))
        assertEquals("Pausado · faltam 1 min", pausado(-5))
    }

    @Test
    fun agendaIdaEVolta() {
        val agenda = listOf(
            Alarme(1, as1735, "fim-foco", "Período de foco concluído", "Intervalo de 5 min. Próximo foco às 17:40.",
                Continua("intervalo", fimMs = as1735 + 300_000)),
            Alarme(2, as1735 + 300_000, "fim-intervalo", "Intervalo concluído", "Período de foco 2 de 2, 25 min.",
                Continua("foco", fimMs = as1735 + 1_800_000)),
            Alarme(3, as1735 + 60_000, "fim-sem-som", "Temporizador encerrado", null, null),
            Alarme(4, as1735 + 90_000, "fim-temporizador", "Temporizador \"x\" · ção", "Chá · 3 min",
                Continua("temporizador", "Chá", pausado = true, restanteMs = 90_000)),
        )
        assertEquals(agenda, Agenda.deJson(Agenda.paraJson(agenda)))
        assertEquals(emptyList<Alarme>(), Agenda.deJson(Agenda.paraJson(emptyList())))
    }

    @Test
    fun agendaNoFormatoDoRust() {
        // As chaves do serde(rename_all = "camelCase") do A09; corpo e continuaDepois podem vir null ou faltar.
        val json = """[{"id":7,"quandoMs":$as1735,"canal":"fim-foco","titulo":"T","corpo":null,"continuaDepois":null},
            {"id":8,"quandoMs":${as1735 + 1},"canal":"fim-intervalo","titulo":"U"},
            {"id":9,"quandoMs":${as1735 + 2},"canal":"fim-foco","titulo":"V","continuaDepois":{"tipo":"intervalo","fimMs":5}}]"""
        assertEquals(
            listOf(
                Alarme(7, as1735, "fim-foco", "T"),
                Alarme(8, as1735 + 1, "fim-intervalo", "U"),
                Alarme(9, as1735 + 2, "fim-foco", "V", null, Continua("intervalo", fimMs = 5)),
            ),
            Agenda.deJson(json),
        )
    }

    @Test
    fun agendaQuebradaNaoDerrubaNada() {
        assertEquals(emptyList<Alarme>(), Agenda.deJson(null))
        assertEquals(emptyList<Alarme>(), Agenda.deJson(""))
        assertEquals(emptyList<Alarme>(), Agenda.deJson("{\"id\":1}"))
        assertEquals(emptyList<Alarme>(), Agenda.deJson("[{\"id\":1,"))
        // Itens sem campo obrigatório, ou com tipo errado, saem; os bons ficam.
        val json = """[{"quandoMs":1,"canal":"fim-foco","titulo":"sem id"},
            {"id":2,"canal":"fim-foco","titulo":"sem quando"},
            {"id":3,"quandoMs":1,"titulo":"sem canal"},
            {"id":4,"quandoMs":1,"canal":"fim-foco","titulo":null},
            {"id":"x","quandoMs":1,"canal":"fim-foco","titulo":"id ruim"},
            5,
            {"id":6,"quandoMs":1,"canal":"fim-foco","titulo":"ok","continuaDepois":{"nome":"sem tipo"}}]"""
        assertEquals(listOf(Alarme(6, 1, "fim-foco", "ok")), Agenda.deJson(json))
    }

    @Test
    fun pendentesDescartaOsVencidosEOrdena() {
        val a = Alarme(1, 300, "fim-foco", "a")
        val b = Alarme(2, 100, "fim-intervalo", "b")
        val c = Alarme(3, 200, "fim-foco", "c")
        assertEquals(listOf(c, a), Agenda.pendentes(listOf(a, b, c), 100))
        assertEquals(listOf(b, c, a), Agenda.pendentes(listOf(a, b, c), 99))
        assertEquals(emptyList<Alarme>(), Agenda.pendentes(listOf(a, b, c), 300))
    }

    @Test
    fun corDoTema() {
        assertEquals(0xFF1E1E1E.toInt(), corOpaca("#1e1e1e"))
        assertEquals(0xFFFFFFFF.toInt(), corOpaca("#fff"))
        assertEquals(0xFFAABBCC.toInt(), corOpaca(" #AABBCC "))
        assertNull(corOpaca("1e1e1e"))
        assertNull(corOpaca("transparent"))
        assertNull(corOpaca("#12345"))
        assertNull(corOpaca("#gggggg"))
        assertNull(corOpaca(null))
    }

    @Test
    fun osCincoCanaisDoA08() {
        // 5.5: ids, importância e som de cada canal (imutáveis depois de criados).
        val porId = Canais.todos.associateBy { it.id }
        assertEquals(5, porId.size)
        assertEquals(Canal(Canais.FIM_FOCO, "Fim do foco", porId.getValue("fim-foco").descricao, true, "focus_end"), porId["fim-foco"])
        assertEquals("break_end", porId.getValue("fim-intervalo").som)
        assertEquals("focus_end", porId.getValue("fim-temporizador").som)
        assertNull(porId.getValue("fim-sem-som").som)
        assertNull(porId.getValue("sessao").som)
        assertEquals(listOf(true, true, true, true, false), Canais.todos.map { it.alta })
        // Os sons dos canais são os mesmos do "Testar".
        assertEquals(setOf("focus_end", "break_end"), Canais.todos.mapNotNull { it.som }.toSet())
        assertEquals(setOf(recursoDoSom("focusEnd"), recursoDoSom("breakEnd")), Canais.todos.mapNotNull { it.som }.toSet())
        // Nenhum nome ou descrição com "Pomodoro".
        assertFalse(Canais.todos.any { "pomodoro" in (it.nome + it.descricao).lowercase() })
    }

    @Test
    fun oSomDoCanalVaiPeloNomeDoRecurso() {
        assertEquals(
            "android.resource://io.github.kbrianps.tomatito.debug/raw/focus_end",
            Canais.uriDoSom("io.github.kbrianps.tomatito.debug", "focus_end"),
        )
    }
    private fun item(id: Int, quando: Long) = Alarme(id, quando, Canais.FIM_FOCO, "Fim do foco")

    @Test
    fun aTrocaCancelaTudoDaAnteriorEAgendaANovaEmOrdem() {
        val antiga = listOf(item(1, 60_000), item(2, 120_000), item(100_001, 90_000))
        val nova = listOf(item(3, 180_000), item(2, 125_000))
        val t = trocaDeAgenda(antiga, nova, agoraMs = 10_000)
        assertEquals(listOf(1, 2, 100_001), t.cancelar)
        assertEquals(listOf(2, 3), t.agendar.map { it.id })
        assertTrue(t.postarAgora.isEmpty())
    }

    @Test
    fun aTrocaPostaOQueVenceuSemOFimReceiverEDescartaOVelho() {
        // O motor passou do fim da fase 1 antes do alarme: a nova agenda não
        // tem o item 1, que já venceu e ainda está gravado (não foi postado).
        val antiga = listOf(item(1, 60_000), item(2, 120_000))
        val nova = listOf(item(2, 120_000))
        assertEquals(listOf(1), trocaDeAgenda(antiga, nova, agoraMs = 60_020).postarAgora.map { it.id })
        // Um item que continua na nova (mesmo id e instante) não sai duas vezes.
        assertTrue(trocaDeAgenda(antiga, antiga, agoraMs = 60_020).postarAgora.isEmpty())
        // Pausa antes do fim: nada venceu, nada sai.
        assertTrue(trocaDeAgenda(antiga, emptyList(), agoraMs = 59_000).postarAgora.isEmpty())
        // Vencido há mais que a tolerância: não avisa de novo.
        assertTrue(trocaDeAgenda(listOf(item(1, 60_000)), emptyList(), agoraMs = 60_000 + Agenda.TOLERANCIA_MS + 1).postarAgora.isEmpty())
    }

    @Test
    fun oDisparoTiraSoOItemDaAgenda() {
        val agenda = listOf(item(1, 60_000), item(2, 120_000))
        val (disparado, resto) = disparoDaAgenda(agenda, 1, 60_000)!!
        assertEquals(1, disparado.id)
        assertEquals(listOf(2), resto.map { it.id })
        // Mesmo id, outro instante (alarme de uma agenda anterior): nada.
        assertNull(disparoDaAgenda(agenda, 1, 65_000))
        assertNull(disparoDaAgenda(resto, 1, 60_000))
    }

    @Test
    fun depoisDoBootSoOQueNaoVenceuVoltaEONadaAvisa() {
        val agenda = listOf(item(2, 120_000), item(1, 60_000), item(3, 180_000))
        // Ligou aos 60,5 s: o fim 1 venceu há meio segundo e mesmo assim não avisa.
        val t = reagendamento(agenda, agoraMs = 60_500, motivo = MotivoDoReagendamento.BOOT)
        assertEquals(listOf(2, 1, 3), t.cancelar)
        assertTrue(t.postarAgora.isEmpty())
        assertEquals(listOf(2, 3), t.agendar.map { it.id })
        // Tudo vencido: agenda vazia; nada gravado: nada a fazer.
        assertTrue(reagendamento(agenda, 200_000, MotivoDoReagendamento.BOOT).agendar.isEmpty())
        val vazia = reagendamento(emptyList(), 0, MotivoDoReagendamento.BOOT)
        assertTrue(vazia.cancelar.isEmpty() && vazia.agendar.isEmpty() && vazia.postarAgora.isEmpty())
    }

    @Test
    fun naConcessaoOVencidoRecenteSaiEOVelhoNao() {
        val agenda = listOf(item(1, 60_000), item(2, 150_000), item(3, 240_000))
        // O inexato do fim 1 atrasou: a concessão chega aos 61 s e ele sai agora.
        val t = reagendamento(agenda, agoraMs = 61_000, motivo = MotivoDoReagendamento.PERMISSAO)
        assertEquals(listOf(1, 2, 3), t.cancelar)
        assertEquals(listOf(1), t.postarAgora.map { it.id })
        assertEquals(listOf(2, 3), t.agendar.map { it.id })
        // Vencido há mais que a tolerância: sai da agenda sem aviso.
        val velho = reagendamento(agenda, 60_000 + Agenda.TOLERANCIA_MS + 1, MotivoDoReagendamento.PERMISSAO)
        assertTrue(velho.postarAgora.isEmpty())
        assertEquals(listOf(2, 3), velho.agendar.map { it.id })
        // Nada venceu: a mesma agenda, agora exata.
        assertEquals(listOf(1, 2, 3), reagendamento(agenda, 10_000, MotivoDoReagendamento.PERMISSAO).agendar.map { it.id })
    }

    @Test
    fun oPacoteDoAgendarTrazAAgendaEAContinuaDeAgora() {
        // O `agenda::Pacote` do Rust (A11), com a contínua da fase correndo.
        val p = Agenda.pacoteDeJson(
            """{"agenda":[{"id":1,"quandoMs":$as1735,"canal":"fim-foco","titulo":"T","corpo":null,"continuaDepois":null}],
            "continua":{"tipo":"foco","nome":"","fimMs":$as1735,"pausado":false,"restanteMs":0}}""",
        )!!
        assertEquals(listOf(1), p.agenda.map { it.id })
        assertEquals(Continua("foco", fimMs = as1735), p.continua)
        // Parado: agenda vazia e contínua null (ela sai); pausado: sem prazo.
        assertEquals(Pacote(emptyList(), null), Agenda.pacoteDeJson("""{"agenda":[],"continua":null}"""))
        assertEquals(
            Pacote(emptyList(), Continua("intervalo", pausado = true, restanteMs = 40_000)),
            Agenda.pacoteDeJson("""{"agenda":[],"continua":{"tipo":"intervalo","nome":"","fimMs":0,"pausado":true,"restanteMs":40000}}"""),
        )
        // Sem a chave `continua`, ou sem `tipo`: sem contínua.
        assertNull(Agenda.pacoteDeJson("""{"agenda":[]}""")!!.continua)
        assertNull(Agenda.pacoteDeJson("""{"agenda":[],"continua":{"nome":"x"}}""")!!.continua)
        // Sem agenda, ou quebrado: o comando recusa.
        assertNull(Agenda.pacoteDeJson("""{"continua":null}"""))
        assertNull(Agenda.pacoteDeJson("não é json"))
        assertNull(Agenda.pacoteDeJson(null))
    }
}
